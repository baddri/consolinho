# 0004 — SA token encryption with ASP.NET Data Protection
**Status:** Accepted (2026-11-18)

## Context
SA tokens must be encrypted at rest and never returned to clients.

## Decision
`ITokenProtector` port in Application; Infrastructure implements it with Data Protection (`IDataProtector`, purpose `FleetConsole.Credentials.v1`). Key ring persisted to Postgres (`PersistKeysToDbContext`) and protected with a certificate (`ProtectKeysWithCertificate`) in production. Fingerprint = first 8 hex chars of SHA-256 of the token.

## Consequences
Key rotation is handled by Data Protection. Losing the key-encryption cert means re-entering all tokens — documented in ops runbook.
