---
id: T-0099
title: Fail-fast production configuration, mandatory Data Protection certificate and the `migrate` mode
status: done
owner: backend-engineer
checkpoint: 3
depends_on: [T-0098]
paths: [src/FleetConsole.Api/Program.cs, src/FleetConsole.Api/Hosting/, src/FleetConsole.Infrastructure/Crypto/, src/FleetConsole.Infrastructure/Persistence/DatabaseMigrator.cs, src/FleetConsole.Infrastructure/Persistence/DevelopmentDatabaseMigrator.cs, src/FleetConsole.Infrastructure/DependencyInjection.cs, src/FleetConsole.Infrastructure/Identity/OpenShiftHostOptions.cs, tests/FleetConsole.Api.Tests/Integration/TestHostConfiguration.cs, tests/FleetConsole.Api.Tests/Integration/Hosting/, tests/FleetConsole.Api.Tests/Persistence/]
review_rounds: 0
---

## Goal
Production must refuse to start with missing/invalid configuration (one clear line naming the key, never the value),
must not start without the Data Protection key-encryption certificate, and the same image must be able to apply
schema migrations as an init container. Spec: HOST-4 (test), HOST-6, CFG-2, DB-1, DB-2.

## Scope
- In: startup validation for the connection string and the DP certificate; Program's startup-error handling; the
  `migrate` argument; shared `DatabaseMigrator`; remove `UnprotectedKeyRingWarning`; HOST-4 cookie test.
- Out: SPA/probes/logging (T-0098), headers (T-0092), container/manifests (T-0100/T-0101).

## Contract / design notes (ADR-0027, ADR-0028 §6)
- **Connection string**: options (or a dedicated `IValidateOptions`) validated on start in every environment:
  failure `ConnectionStrings:consoledb is not configured.` The DbContext keeps reading it lazily.
- **DP certificate** (`Infrastructure/Crypto`): outside Development `DataProtection:KeyEncryptionCertificatePath` is
  required; validate on start: file exists, PKCS#12 loads with the optional password file
  (`DataProtection:KeyEncryptionCertificatePasswordPath`, trailing newline trimmed as today), has a private key.
  Failure messages name the key, never the password. Loading must move **out of service registration** (today
  `AddConsoleDataProtection` loads eagerly) into options configuration, e.g. `IConfigureOptions<KeyManagementOptions>`
  setting `XmlEncryptor = new CertificateXmlEncryptor(cert, loggerFactory)` + `XmlKeyDecryptionOptions.AddKeyDecryptionCertificate(cert)`
  (what `ProtectKeysWithCertificate` does), with the certificate loaded once by a singleton. Development without a
  path keeps working unencrypted. Delete `UnprotectedKeyRingWarning`.
- **Rotation support** (OPS-2): optional `DataProtection:PreviousKeyEncryptionCertificatePath` (+
  `DataProtection:PreviousKeyEncryptionCertificatePasswordPath`), validated the same way when set and registered only
  via `XmlKeyDecryptionOptions.AddKeyDecryptionCertificate`. Test: keys encrypted with cert A are readable by a host
  configured with current = B, previous = A.
- **Program**: wrap host start/run; `catch (OptionsValidationException ex)` → for each `ex.Failures` log Critical
  `Startup configuration error: {Failure}` (source-generated `LoggerMessage`, logger from `app.Services`), return exit
  code 1. No other exception types are swallowed.
- **Migrate mode** (`Api/Hosting/MigrateMode.cs` or similar): `args` is exactly `["migrate"]` (anything else unknown
  → normal web host; document). Checked right after `builder.Build()`: run `DatabaseMigrator.MigrateAsync(app.Services,
  ct)`, log the applied migration names (Information) or "schema is up to date", return 0; on exception log one
  Critical line (exception type + message; never the connection string) and return 1. Host never started, so no
  `ValidateOnStart` and no hosted services run. Requires only `ConnectionStrings:consoledb`.
- **`DatabaseMigrator`** (`Infrastructure/Persistence`, public static or a small public class — XML doc): creates a
  scope, `Database.MigrateAsync`, returns applied names (`GetPendingMigrationsAsync` before). `DevelopmentDatabaseMigrator`
  delegates to it. Relies on EF Core's migration lock for concurrent pods (doc comment).
- Fix `OpenShiftHostOptions.ClientId` XML doc: production client id is the OAuthClient name (`consolinho`, ADR-0030),
  not a ServiceAccount.
- **Tests**: `TestHostConfiguration.Offline()` gains a test DP certificate (generate a self-signed PFX + password file
  once per test run in a temp dir; copy the helper pattern from `DataProtectionSetupTests.WriteCertificate`) so every
  Production host keeps starting.

## Context pack
- Docs: ADR-0027, ADR-0028 §6; BACKEND.md § Persistence, § Hosting & deployment (CP3).
- Touch points: `src/FleetConsole.Infrastructure/Crypto/DataProtectionSetup.cs:AddConsoleDataProtection, LoadCertificate`
  (L20-75); `src/FleetConsole.Infrastructure/Crypto/UnprotectedKeyRingWarning.cs` (delete);
  `src/FleetConsole.Infrastructure/DependencyInjection.cs:L46-62` (DbContext registration, dev migrator ordering note);
  `src/FleetConsole.Infrastructure/Persistence/DevelopmentDatabaseMigrator.cs:StartAsync`;
  `src/FleetConsole.Api/Program.cs:L47,L74` (after Build / RunAsync); validator exemplar
  `src/FleetConsole.Api/Hosting/PublicOriginOptions.cs:PublicOriginOptionsValidator` (L47-98) and
  `src/FleetConsole.Infrastructure/Identity/OpenShiftHostOptionsValidator.cs` (messages name keys).
- Cookies (HOST-4): `src/FleetConsole.Api/Auth/AuthenticationSetup.cs:L46-54, L109-110` already use
  `SecurePolicy.Always` outside Development — test only, no change expected.
- Tests: `tests/FleetConsole.Api.Tests/Persistence/DataProtectionSetupTests.cs:WriteCertificate` (L103-115);
  `Integration/TestHostConfiguration.cs:Offline` (L28-40); `Integration/PostgresFixture.cs` (fresh database for the
  migrator tests); `Integration/Hosting/ProductionHost.cs` (from T-0098).

## Acceptance criteria
- [x] HOST-6: Production host start fails with `OptionsValidationException` naming the key for: missing connection
      string, missing DP cert path, non-existent cert file, wrong password, cert without private key, missing
      `Console:PublicOrigin`; no failure message contains the password/secret test values.
- [x] CFG-2: Production host with a valid cert encrypts new key-ring entries (`data_protection_keys.xml` contains
      `encryptedSecret`); Development without a cert still starts.
- [x] OPS-2 rotation: keys written under cert A are readable by a host with current = B and previous = A.
- [x] DB-1: `DatabaseMigrator` on a fresh database applies all migrations; second run applies none; two concurrent runs
      both succeed (`Task.WhenAll`).
- [x] HOST-4: Production `GET /api/auth/login` over plain HTTP → 302 and every `Set-Cookie` has `secure`; session cookie
      options resolve to `SecurePolicy.Always`, `HttpOnly`, `SameSite=Lax`.
- [x] Program: `migrate` returns 0/1 as specified (verified end-to-end by T-0100's image check); startup validation
      failure → one Critical line per failure and exit 1 (same).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-21 backend-engineer: started; design: cert options + validator + lazily loaded singleton, migrate mode, shared migrator.

- 2026-11-21 backend-engineer: DP certs via KeyEncryptionCertificateOptions(+validator)/KeyEncryptionCertificates singleton;
  decryption certs registered lazily (see deviation 1); connection-string options; DatabaseMigrator + advisory lock
  (deviation 2); MigrateMode + ConsoleHostRunner; tests. Outside paths: new Persistence/ConsoleDatabaseOptions.cs,
  one-line doc fix in ConsoleDbContext.cs (migration remark), ProductionHost: settings now win over Offline + starts dev host first.
- 2026-11-21 backend-engineer: review round 1 fix — `ConsoleHostRunner` also handles an `AggregateException` made only
  of `OptionsValidationException`s (flattened; helper `TryGetConfigurationFailures`); anything else propagates. Tests:
  two invalid options types at once (both keys reported) + mixed/non-validation exceptions rejected.

## Review
**Round 1 — backend-architect: CHANGES_REQUESTED**
- src/FleetConsole.Api/Hosting/ConsoleHostRunner.cs:27 — `IStartupValidator.Validate()` throws an `AggregateException`
  when options of more than one type fail (e.g. no connection string and no DP cert — a typical first deploy), so
  only single-type failures get the Critical lines; the rest crash with a stack trace — also catch `AggregateException`
  whose inner exceptions are all `OptionsValidationException` and log every failure of each (exit 1); update the XML doc.
- tests/FleetConsole.Api.Tests/Integration/Hosting/ProductionConfigurationTests.cs — no test covers several failing
  options types — add a case (e.g. `Console:PublicOrigin` and `ConnectionStrings:consoledb` empty) asserting what
  `RunStartValidation` throws contains both keys; ideally extract the failure-flattening into a small testable helper.
- Rulings: (1) advisory lock + create-if-missing accepted (EF's `MigrateAsync` already created missing databases);
  ADR-0027 §4 amended by the architect. (2) Lazy `UnprotectKeysWithAnyCertificate` registration accepted: public API
  only, documented, and the rotation test exercises the real `EncryptedXmlDecryptor` incl. the negative case; outside
  Development a missing/invalid cert fails `ValidateOnStart` and, as a backstop, `KeyEncryptionCertificates` (via
  `options.Value`), so the key ring is never written unencrypted. (3) `ProductionHost` change accepted. (4) T-0100
  step 7/7b now require exit code 1 + the exact log lines for both modes and the multi-failure case (architect edit).
- Architect doc fix: `DatabaseMigrator.MigrateAsync` `<returns>` claimed listed migrations might be applied by another
  run; the list is read under the lock.
- Optional: `TestHostConfiguration` per-run PFX temp dir is never deleted (fake material, 0700 dir) — fine to leave.

**Round 2 — backend-architect: APPROVE** — `ConsoleHostRunner.TryGetConfigurationFailures` handles a single
`OptionsValidationException` or a flattened `AggregateException` of only those (anything mixed is rethrown); the XML doc
is updated; tests cover the real two-type startup failure and the mixed/non-config negatives. Round-1 finding resolved.

## Handover notes
- **Deviation 1:** `XmlKeyDecryptionOptions` is internal, so `IConfigureOptions<XmlKeyDecryptionOptions>` can't be written.
  `DataProtectionSetup.AddDecryptionCertificates` learns the service type by running `UnprotectKeysWithAnyCertificate`
  on a scratch collection and registers a factory that runs it with the loaded certs on first resolve (public API only).
- **Deviation 2 (ADR-0027 §4 assumption wrong):** EF/Npgsql's migration lock did NOT serialise two concurrent runs
  (42P07 "relation already exists", reproduced). `DatabaseMigrator` now holds a session `pg_advisory_lock` on an
  unpooled connection around pending-read + migrate; it also creates a missing database (race-tolerant). ADR-0027 §4
  text should be amended by the architect.
- Program: `migrate` (exactly `["migrate"]`) → `MigrateMode.RunAsync` (0/1, one Critical line type+message);
  otherwise `ConsoleHostRunner.RunAsync` (StartAsync, catch OptionsValidationException → Critical per failure, exit 1).
  Exit codes untested in-process (factory race, T-0094) — T-0100 image check must cover them.
- Tests: cert failure matrix + rotation in `DataProtectionSetupTests` (validator run directly); HOST-6/CFG-2/HOST-4 in
  `Integration/Hosting/ProductionConfigurationTests`; DB-1 in `Persistence/DatabaseMigratorTests`.
  `TestHostConfiguration.Offline()` adds a per-run test PFX (temp dir, not deleted).
