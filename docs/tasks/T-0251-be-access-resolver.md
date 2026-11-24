---
id: T-0251
title: AccessResolver — pure domain service for grant precedence (PREC-3..6, PREC-8)
status: todo
owner: backend-engineer
checkpoint: 4.5a
depends_on: []          # wave 1, parallel with T-0250 and T-0254 (no shared files)
paths: [src/FleetConsole.Domain/Access/Resolution, tests/FleetConsole.Domain.Tests/Access/Resolution]
review_rounds: 0
---

## Goal
One implementation of "which grant applies to (user, cluster) and why" (ADR-0034 §4, Consequences), used later by the
proxy authorization query, the switcher (T-0253) and Effective access (T-0257). Pure, synchronous, no I/O, no
framework; exhaustively table-tested.

## Scope
- In: `AccessResolver`, input/output records, tests.
- Out: loading candidates from SQL (T-0253); logging (callers log when `TieDetected`).

## Contract / design notes
Folder `Domain/Access/Resolution/`. Deliberately independent of T-0250 types (strings, not `GroupName`) so both can
run in parallel; T-0253 maps `Grant` rows to candidates.
```csharp
public sealed record AccessCandidate(GrantId GrantId, string? GroupName, int? Priority, AccessMode AccessMode, CredentialId CredentialId)
{ public bool IsDirect => GroupName is null; }   // direct user grant when GroupName is null

public enum CandidateOutcome { Winner, OverriddenByDirectGrant, LowerPriority, TieReadOnlyWins, TieBrokenById }

public sealed record CandidateVerdict(AccessCandidate Candidate, CandidateOutcome Outcome, string? BeatenByGroup);

public sealed record AccessResolution(
    AccessCandidate Winner, AccessMode EffectiveMode, bool NarrowedByReadOnlyFlag,
    IReadOnlyList<CandidateVerdict> Verdicts,   // every considered candidate, winner first, then priority desc, then GrantId
    bool TieDetected);                          // two group candidates shared the winning priority

public static class AccessResolver
{
    /// candidates: grants of ONE cluster that may apply to the user (direct ones + group ones; SQL pre-filters).
    /// userGroups: the user's recorded groups. userIsReadOnly: stricter of stored/session flag (caller decides).
    public static AccessResolution? Resolve(IReadOnlyCollection<AccessCandidate> candidates,
        IReadOnlyCollection<string> userGroups, bool userIsReadOnly);   // null = no access
}
```
Rules, in order:
1. Drop group candidates whose group is not in `userGroups` (ordinal) or starts with `system:` (any case — GRP-3,
   defence in depth); dropped candidates are **not** in `Verdicts`. Also ignore `system:*` entries of `userGroups`.
2. None left → `null`.
3. Any direct candidate → it wins (PREC-3); every group candidate is `OverriddenByDirectGrant`. (Two direct
   candidates can't exist — unique index; if they do, `InvalidOperationException`.)
4. Else highest `Priority` wins (PREC-4); others with lower priority → `LowerPriority`, `BeatenByGroup` = winner's group.
5. Tie at the top priority (PREC-5): a `ReadOnly` one beats `ReadWrite` ones (`TieReadOnlyWins`); among equal modes
   the lowest `GrantId` (Guid v7 = oldest grant) wins, losers `TieBrokenById`; `TieDetected = true`.
6. `EffectiveMode` = `ReadOnly` if `userIsReadOnly` or the winner is `ReadOnly`; `NarrowedByReadOnlyFlag` =
   `userIsReadOnly && winner.AccessMode == ReadWrite` (PREC-6).
Group-name/priority sanity (null priority on a group candidate) → `ArgumentException` (bug).

## Context pack
- Docs: ADR-0034 §4; spec §4.2 PREC (grep `PREC-`); `BACKEND.md` §Domain (L25-55).
- Exemplars: `Domain/Access/Grant.cs` (doc-comment style); a table-driven test in `tests/FleetConsole.Domain.Tests/Access/` (grep `TheoryData`).
- Touch points: `Domain/Access/GrantId.cs` (comparable `Guid` value), `Domain/Access/AccessMode.cs`, `Domain/Credentials/CredentialId.cs`.

## Acceptance criteria
- [ ] PREC-3/4/5/6 and GRP-3 (membership side) covered by one table-driven test: direct vs group (incl. RW group over RO direct → RO direct wins), priorities, tie RO-wins, tie by id, RO flag narrowing, `system:*` in groups and as candidate, non-member group, no candidates.
- [ ] Verdict order and `BeatenByGroup` asserted; resolver deterministic regardless of input order (shuffle test).
- [ ] No dependency outside `Domain` (DomainAssemblyTests pass); XML docs explain each rule; `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
