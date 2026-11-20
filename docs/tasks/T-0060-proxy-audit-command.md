---
id: T-0060
title: Proxy mutation audit — Proxy category, KubernetesResource target, RecordProxyAudit command
status: done
owner: backend-engineer
checkpoint: 2
depends_on: [T-0056]
paths: [src/FleetConsole.Domain/Audit/, src/FleetConsole.Application/Proxy/RecordProxyAudit/, src/FleetConsole.Application/Audit/, tests/FleetConsole.Domain.Tests/Audit/, tests/FleetConsole.Application.Tests/Proxy/RecordProxyAudit/, tests/FleetConsole.Application.Tests/Audit/, docs/specs/CP1-api-contract.md]
review_rounds: 0
---

## Goal
Everything needed to record one audit entry per proxied mutation, allowed or denied (PAUD-1..3), and to filter them in
the existing audit log (PAUD-4, backend half). The Api calls the command (T-0061). Parallel with T-0059.

## Scope
- In: enum values, `proxy` action prefix, command + handler + record types, audit list query check, CP1 contract §3/§10
  cross-reference to the CP2 contract, `npm run gen:api` is **not** run here (FE regenerates after merge; note it in
  Handover).
- Out: calling it from HTTP; FE.

## Contract / design notes
ADR-0021; shape in `docs/specs/CP2-api-contract.md` §5 (binding).
```csharp
// Domain/Audit
public enum AuditCategory { …, Proxy = 5 }            // AuditEntry.CategoryOf: "proxy" => Proxy
public enum AuditTargetType { …, KubernetesResource = 5 }
// Application/Proxy/RecordProxyAudit
public enum ProxyAuditOutcome { Allowed, Denied }
public enum ProxyDenialReason { NoAccess, UserReadOnly, ReadOnlyGrant, BodyTooLarge }
public sealed record ProxyAuditRecord(string? ClusterName, ProxyRequest Request, int StatusCode,
    ProxyAuditOutcome Outcome, ProxyDenialReason? Reason);
public sealed record RecordProxyAuditCommand(ProxyAuditRecord Record) : ICommand, IRequireAuthenticated; // NOT IMutatingCommand
internal sealed class RecordProxyAuditHandler(IAuditTrail auditTrail, ICurrentUser currentUser) // stages one entry, returns Success
public static class ProxyAuditActions { const string Prefix = "proxy."; static string For(KubernetesVerb verb); } // create|update|patch|delete|delete_collection|connect|other
```
- Entry: actor = current user (AuditTrail default), `TargetType=KubernetesResource`, `TargetId=null`,
  `TargetName=Request.Info.DisplayName`, `ClusterName`, summary per contract §5 examples (username from
  `ICurrentUser.Username`), `Details` = anonymous/record object serialized camelCase with exactly the contract keys
  (`group` is `""` for core, `null` for non-resource). Enums in details as camelCase strings.
- Verbs `Get/List/Watch` must never reach here: throw `ArgumentException` (programming error; T-0061 only audits mutations).
- `ListAuditEntries` needs no code change for `category=proxy`/`cluster=` — prove it with a test; `AuditCategoryNames`
  picks the new value up automatically.
- The audit coverage test (`AuditCoverageTests`) is domain-event based; proxy entries are not events — no change
  expected; if it enumerates categories, extend it.
- CP1 contract §10: add one line "Proxy entries (category `proxy`): see CP2 contract §5". Stored as ints → **no migration**.

## Context pack
- Exemplar (audit without aggregate): `src/FleetConsole.Application/Auth/LogOut/LogOutHandler.cs` + `LogOutCommand.cs`; action constants: `src/FleetConsole.Application/Auth/AuthAuditActions.cs`.
- `src/FleetConsole.Domain/Audit/AuditEntry.cs:L130-146` (`CategoryOf`) and enum files `AuditCategory.cs`, `AuditTargetType.cs`.
- `src/FleetConsole.Application/Audit/IAuditTrail.cs` (`AuditRecord`), `AuditTrail.cs:L40-50` (actor/correlation fill).
- Tests: `tests/FleetConsole.Domain.Tests/Audit/AuditEntryTests.cs:L71-73` (category InlineData — add `proxy.update`), `tests/FleetConsole.Application.Tests/Audit/AuditTrailTests.cs`, `Audit/ListAuditEntries/ListAuditEntriesTests.cs`, fakes in `Audit/AuditFakes.cs`.

## Acceptance criteria
- [x] PAUD-1: handler test — PUT configmap allowed 200 → action `proxy.update`, category Proxy, target `shop/configmaps/web`, details exactly the contract keys/values incl. `dryRun`/`fieldManager`; no body/header/other query data.
- [x] PAUD-2: denied record (`ReadOnlyGrant`, 403) → `outcome: denied`, `reason: readOnlyGrant`; `NoAccess` with null cluster name works.
- [x] Command is not `IMutatingCommand` (read-only user's denial is recorded through the real pipeline — behavior test with `ReadOnlyGuardBehavior`).
- [x] Verb → action table test (all 7); Get/List/Watch throw.
- [x] `ListAuditEntries` filters `category=proxy` and `cluster` over proxy entries.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 backend-engineer: ff-merged cp/2-proxy-browser. Added `Proxy`/`KubernetesResource` enum values + `proxy` prefix,
  `Application/Proxy/RecordProxyAudit` (command, handler, record, outcome/reason enums, actions). Details = private fixed record.
  Outside paths (one line each, expected-value updates): `Api.Tests/.../OpenApiDocumentTests.cs` AuditCategory enum list
  gains `proxy`; Domain test "unknown prefix" sample `proxy.mutated` → `kube.mutated`. No migration. check-be green.

## Review
**2026-11-20 backend-architect — APPROVE** (round 1). Matches ADR-0021 §1/§4/§5 and CP2 contract §5; details are a fixed
private record (exact key set asserted, no token/query leak); enums stored as plain ints (no `HasConversion`) → no
migration needed; outside-path test edits are expected-value updates — accepted.
- Scope note: own unit of work = the dispatch's `UnitOfWorkBehavior`; try/catch + Error log (EventId 2400) + swallow and
  `CancellationToken.None` are **T-0061's** job (ADR-0021 §2) — the handler's `ArgumentException`s rely on that catch.
- Optional: `details.path`/`dryRun`/`fieldManager`/`targetName` are unbounded `text`; effectively capped by Kestrel's
  request-line limit (8 KB). If T-0061 raises that limit, add truncation there — no change here.
- Optional: summary wording for delete_collection/connect/other is engineer's choice; PO may adjust in UX review.

## Handover notes
- T-0061: dispatch `RecordProxyAuditCommand(new ProxyAuditRecord(clusterNameOrNull, request, status, outcome, reason))`
  with `CancellationToken.None`; handler throws `ArgumentException` for Get/List/Watch and for outcome/reason mismatch
  (Denied requires a reason, Allowed forbids one) — both are caller bugs.
- Summary wording beyond contract examples (my choice): delete_collection "deleted all of shop/pods", connect
  "connected to …", other "sent TRACE to …"; reasons "no access"/"read-only user"/"read-only grant"/"body too large";
  " on <cluster>" omitted when the cluster name is null.
- FE: run `npm run gen:api` after merge (AuditCategory `proxy`, AuditTargetType `kubernetesResource`).
- CP1 contract §3 enum rows and §10 got the CP2 cross-reference.
