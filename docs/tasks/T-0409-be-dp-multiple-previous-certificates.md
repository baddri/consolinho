---
id: T-0409
title: Data Protection — list of previous certificates (A→B→C rotation) + start validation names the path
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: []
paths: [src/FleetConsole.Infrastructure/Crypto, tests/FleetConsole.Api.Tests/Integration/Hosting, tests/FleetConsole.Api.Tests/DataProtection, docs/ops/RUNBOOK.md, docs/architecture/SECURITY.md, docs/adr/0028-*.md]
review_rounds: 0
size: M (1 d)
---

## Goal
A second rotation before old key-ring entries age out must not make SA tokens undecryptable (spec DPR-1..3); a
misconfigured certificate fails start with a line an operator can act on (SEC-3).

## Scope
- In: options + loader + validator, tests, RUNBOOK §8.2 procedure, ADR-0028 §6 note.
- Out: key re-encryption tooling.

## Contract / design notes
- New config list `DataProtection:PreviousCertificates:{n}:Path` / `:PasswordPath` (0..n entries). The existing single
  `PreviousKeyEncryptionCertificatePath`/`PasswordPath` keeps working and is treated as one more entry (document as
  legacy in RUNBOOK §5; no breaking change).
- `KeyEncryptionCertificates.DecryptionCertificates` (L37) = current + all previous (dedup by thumbprint). Encryption
  always uses the current one only.
- `KeyEncryptionCertificateOptionsValidator`: loads every listed certificate on start; failure message names the key
  **and the file path** (e.g. `DataProtection:PreviousCertificates:1:Path '/var/run/secrets/dp-prev-1/tls.pfx' not readable`).
  Paths are not secrets; passwords and certificate contents are never logged. Amend ADR-0028 §6 ("keys, never values")
  with this one exception (status line note).
- RUNBOOK §8.2: rewrite the rotation procedure for A→B→C (add C as current, move B to previous[0], keep A as
  previous[1] until `oc` shows no key older than A's retirement + key lifetime; then drop A). SECURITY.md § Secrets: one line.

## Context pack
- `src/FleetConsole.Infrastructure/Crypto/KeyEncryptionCertificates.cs` (L37), `KeyEncryptionCertificateOptions*.cs`, `DataProtectionSetup.cs`.
- Test exemplar: `DataProtectionSetupTests.InvalidCertificateConfiguration_FailsStartValidation_NamingTheKey`; generate
  throwaway certs with `CertificateRequest` in the test (no fixtures with real keys).

## Acceptance criteria
- [ ] DPR-1: tokens encrypted under A, then B, then current C, all decrypt with config {C; prev B, A} (test).
- [ ] DPR-2: legacy single previous key still works; combined with the list (test).
- [ ] DPR-3 / SEC-3: missing/unreadable/wrong-password previous cert fails start, message names key + path, never password (test asserts both).
- [ ] RUNBOOK §8.2 updated; build + tests green.

## Work log

## Review

## Handover notes
