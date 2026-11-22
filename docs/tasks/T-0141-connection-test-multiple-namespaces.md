---
id: T-0141
title: Connection test over several namespaces — bounded parallel rules reviews, per-namespace results, saved list
status: done
owner: backend-engineer
checkpoint: 3.7
depends_on: [T-0140]
paths: [src/FleetConsole.Application/Credentials/ConnectionTesting, src/FleetConsole.Application/Credentials/TestCredential, src/FleetConsole.Application/Credentials/TestToken, src/FleetConsole.Api/Endpoints/Admin/CredentialRequests.cs, src/FleetConsole.Api/Endpoints/Admin/CredentialsAdminEndpoints.cs, tests/FleetConsole.Application.Tests/Credentials, tests/FleetConsole.Api.Tests/Integration/Admin/ConnectionTests, tests/FleetConsole.Api.Tests/Integration/Admin/TokenLeakSweepTests.cs]
review_rounds: 0
---

## Goal
Both connection tests take a list of namespaces (0–10) instead of one, review the token's rules in each in parallel
(bounded), and report one result per namespace; one failing namespace never fails the others or the test. The stored
test saves the list on the credential (spec NST-2, NST-3, NST-5, NST-7).

## Scope
- In: test commands/requests/validators, `ConnectionTester` rules phase, `NamespaceRulesDto` shape, result list, saving
  the list on stored tests, audit details, tests.
- Out: distribution detection / new step (T-0142). FE.

## Contract / design notes
Contract: **T-0139 §Contract C** (namespace parts) — request `inspectNamespaces: string[] | null` replaces
`inspectNamespace`; result `namespaceRules: NamespaceRules[]`; per-entry `error`/`failureKind`; warning wording.
- Commands: `TestCredentialCommand(string ClusterName, Guid CredentialId, IReadOnlyList<string>? InspectNamespaces)`,
  `TestTokenCommand(string ClusterName, SensitiveString Token, Guid? CredentialId, IReadOnlyList<string>? InspectNamespaces)`.
  Validators use `ValidInspectNamespaces()` (T-0140). Delete `ConnectionTesting/InspectNamespaceRules.cs` and the Api's
  `ToNamespace` helper (`CredentialsAdminEndpoints.cs` L189-191); blank/trim handling now lives in the VO.
- Handlers build `InspectNamespaces.Create(request.InspectNamespaces).Value`; `TestCredentialHandler` passes it to the
  tester **and** to `credential.RecordTest(summary, namespaces, clusterName)` (replaces the saved list, NST-5).
  `TestTokenHandler` saves nothing; its audit details add `inspectNamespaces = namespaces.Values`.
- `ConnectionTester.RunAsync(..., InspectNamespaces inspectNamespaces, GrantModeCounts? grants, CancellationToken)` (replaces `string? inspectNamespace`).
- `NamespaceRulesDto(string Namespace, bool Incomplete, string? EvaluationError, IReadOnlyList<ResourceRuleDto>? Rules,
  string? Error, ProbeFailureKind? FailureKind)` with static factories `Reviewed(...)` / `Failed(namespace, ProbeFailure)`
  so "exactly one of rules/error" holds by construction. Docs say so (they reach `schema.gen.ts`).
  `ConnectionTestResultDto.NamespaceRules` → `IReadOnlyList<NamespaceRulesDto>` (never null; `TestRun.NamespaceRules` starts `[]`).
- Rules phase (in `CheckCapabilitiesAsync`, after the capability reviews, as today): `Parallel.ForEachAsync` over the
  indices with `MaxConcurrentReviews`; results by index → input order. Per-namespace failure → `Failed(...)` with the
  probe's message (`MessageFor`). **Budget expiry during the rules phase must not fail the step** (NST-3 "timeout"):
  catch `OperationCanceledException` per namespace when the caller's token is not cancelled, and record
  `Failed(ns, Timeout, "No answer within the test time limit.")`; don't pass the budget token as
  `ParallelOptions.CancellationToken` for this loop (it would throw instead of finishing the others). This needs the
  caller's token in `CheckCapabilitiesAsync` — pass it down explicitly and comment why. Caller cancellation still propagates.
- Step outcome: all ok → `Pass(summary)`; any failed → `Warn($"{summary}; rules reviewed in {ok} of {n} namespaces", firstFailedKind)`.
- Audit (`CredentialTested` already carries the names from T-0140): verify `credential.tested` details contain them.

## Context pack
- Docs: `BACKEND.md` §Use case folder convention; ADR-0011 (connection test); spec NST-2/3/5/7.
- Exemplars: `ConnectionTester.cs:CheckCapabilitiesAsync` L266-316 (bounded parallel by index — copy for the rules loop);
  `ConnectionTester.cs:RunAsync` L105-121 (budget vs caller cancellation filter).
- Touch points: `ConnectionTesting/ConnectionTester.cs:RunAsync` L88-141, `RunStepsAsync` L143-165, `TestRun.NamespaceRules` L377;
  `ConnectionTesting/ConnectionTestResultDto.cs` L19-31, L63-69; `TestCredential/TestCredentialCommand.cs`, `…Handler.cs`,
  `…Validator.cs`; `TestToken/TestTokenCommand.cs`, `…Handler.cs` (audit details L76-82), `…Validator.cs`;
  `Api/Endpoints/Admin/CredentialRequests.cs` L19-26 (records + XML docs); `CredentialsAdminEndpoints.cs` L160-191.
- Tests: `tests/FleetConsole.Application.Tests/Credentials/ConnectionTesting/ConnectionTesterTests.cs`,
  `ConnectionTestHandlerTests.cs`, `FakeProbeClient.cs:RulesReview` L23 (per-namespace answers; `Hang` L43 for timeouts);
  `tests/FleetConsole.Api.Tests/Integration/Admin/ConnectionTests/ConnectionTestEndpointsTests.cs`;
  `tests/FleetConsole.Api.Tests/Integration/Admin/TokenLeakSweepTests.cs` (add namespaces to the payloads).

## Acceptance criteria
- [x] 3 namespaces, one 403 and one hanging until the budget → result has 3 entries in input order (1 rules, 2 errors),
      step `capabilities` is a warning "…; rules reviewed in 1 of 3 namespaces", test `succeeded` (NST-3).
- [x] At most `MaxConcurrentReviews` rules reviews in flight (fake probe counter).
- [x] 11 names / an invalid name → 400 field error naming the entry, probe never opened (NST-2).
- [x] Stored test replaces the saved list (empty clears); unsaved-token test changes no credential (NST-5).
- [x] `credential.tested` / `credential.token_tested` details list the names, never the token; leak sweep green (NST-7).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 backend-engineer: started; implemented as specified (commands/validators/requests take lists, old rule
  and `ToNamespace` deleted, rules phase `ReviewRulesAsync` bounded by index, `NamespaceRulesDto` factories, NST-5 save).
- 2026-11-23: `NamespaceRulesDto` is a record with a private ctor + get-only props (not positional) so only
  `Reviewed`/`Failed` can build it; JSON shape = contract. check-be green (333/698/783, Testcontainers via podman).
- 2026-11-23 fix round 1: `[JsonConstructor]` on the private ctor (+ OpenApi required test); removed
  `Failed(ns, ProbeFailure)`; concurrency test asserts exactly 4; added the 401-in-one-namespace tester test.

## Review
**Round 1 — backend-architect, 2026-11-23: CHANGES_REQUESTED.** check-be green (333/698/783). Concurrency is correct:
the loop awaits every body (no unobserved tasks), a budget expiry gives per-namespace Timeout entries, and caller
cancellation propagates. No token in logs or audit, no N+1, layering is fine.
1. `src/FleetConsole.Application/Credentials/ConnectionTesting/ConnectionTestResultDto.cs:74` — with a private ctor
   and get-only props, STJ/JsonSchemaExporter marks **no** property `required` (checked against the built dll:
   `required` is absent; `ResourceRuleDto` lists all 4). `schema.gen.ts` would make every `NamespaceRules` field
   optional, which breaks Contract C (`namespace: string`, `rules: ResourceRule[] | null`, ...). Fix: put
   `[JsonConstructor]` on the private ctor (or `[JsonRequired]` on the six props) and add an `OpenApiDocumentTests`
   assertion that `NamespaceRules.required` lists all six fields, like `CurrentUser_IsTheTyped200SchemaOfMe`.
2. `ConnectionTestResultDto.cs:133` — `Failed(ns, ProbeFailure)` uses the raw `failure.Message` and skips
   `ConnectionTester.MessageFor`, so a 401 would show the probe text instead of the token-rejected text. Only a test
   uses it. Delete the overload and point `ConnectionTesterTests.cs:367` at `Failed(ns, kind, message)`. Also update
   the handover note that mentions it.
- Optional: `ConnectionTesterTests.cs:348` `ShouldBeInRange(1, 4)` also passes if the loop runs one at a time;
  `ShouldBe(4)` is reliable with 10 items × 20 ms. Optional: one tester test for a 401 in one namespace that expects
  the entry `Error == TokenRejectedMessage`.

## Handover notes
- Contract C (namespace parts) implemented; no deviations in the wire shape. `namespaceRules` is always an array.
- Rules phase: `ConnectionTester.ReviewRulesAsync` / `ReviewRulesInAsync`. The loop's `ParallelOptions` uses the
  **caller's** token; each review gets the budget token and a budget expiry becomes a per-namespace `Timeout` entry
  (`ConnectionTester.RulesTimeoutMessage`). Caller abort still throws (unit-tested).
- Per-namespace errors go through `MessageFor` (401 → token-rejected text). Warning `FailureKind` = first failed entry.
- `NamespaceRulesDto` has a private `[JsonConstructor]` ctor, so the OpenAPI schema requires all six fields; build it
  only via `Reviewed(...)` / `Failed(ns, kind, message)` (pass `MessageFor` text, as the tester does).
- 403/timeout-in-one-namespace is covered in `ConnectionTesterTests`; the Api tests cover two reviewed namespaces,
  the saved list replace/clear, audit names, 400 for 11/invalid names with zero cluster requests. The fake kube
  server's rules review still answers every namespace the same (no per-namespace scripting).
- FE: regenerate `schema.gen.ts`; `inspectNamespace` → `inspectNamespaces` on both test requests.
