---
id: T-0099
title: Fail-fast production configuration, mandatory Data Protection certificate and the `migrate` mode
status: todo
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
- [ ] HOST-6: Production host start fails with `OptionsValidationException` naming the key for: missing connection
      string, missing DP cert path, non-existent cert file, wrong password, cert without private key, missing
      `Console:PublicOrigin`; no failure message contains the password/secret test values.
- [ ] CFG-2: Production host with a valid cert encrypts new key-ring entries (`data_protection_keys.xml` contains
      `encryptedSecret`); Development without a cert still starts.
- [ ] OPS-2 rotation: keys written under cert A are readable by a host with current = B and previous = A.
- [ ] DB-1: `DatabaseMigrator` on a fresh database applies all migrations; second run applies none; two concurrent runs
      both succeed (`Task.WhenAll`).
- [ ] HOST-4: Production `GET /api/auth/login` over plain HTTP → 302 and every `Set-Cookie` has `secure`; session cookie
      options resolve to `SecurePolicy.Always`, `HttpOnly`, `SameSite=Lax`.
- [ ] Program: `migrate` returns 0/1 as specified (verified end-to-end by T-0100's image check); startup validation
      failure → one Critical line per failure and exit 1 (same).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
