---
id: T-0007
title: Domain model — users, audit entries, aggregate version
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: []
paths: [src/FleetConsole.Domain/Common/AggregateRoot.cs, src/FleetConsole.Domain/Users/, src/FleetConsole.Domain/Audit/, tests/FleetConsole.Domain.Tests/]
review_rounds: 0
---

## Goal
Model FleetConsole users (OCP identity, effective role from two sources, read-only, deactivation, security stamp,
last-admin protection) and the append-only audit entry, as pure Domain code with unit-tested invariants. Everything in
CP1 that authenticates, authorizes or audits builds on these types. **Parallel group W1** (with T-0009, T-0010).

## Scope
- In: `AggregateRoot.Version`; `Domain/Users/*`; `Domain/Audit/*`; domain errors; domain events; unit tests.
- Out: persistence (T-0012), Application use cases, clusters/credentials/grants (T-0008).

## Contract / design notes
Read ADR-0009 (role sources, security stamp), ADR-0008 (audit), contract `docs/specs/CP1-api-contract.md` §2, §3, §10.

**Common**
- `AggregateRoot<TId>.Version : uint { get; private set; }` — optimistic concurrency token; only persistence sets it
  (EF maps it to Postgres `xmin`, T-0012). XML doc says so. No behaviour depends on it in Domain.

**Users** (`Domain/Users/`)
```csharp
public readonly record struct UserId(Guid Value) { public static UserId New(); }      // Guid.CreateVersion7()
public sealed record Username { public string Value { get; } public static Result<Username> Create(string? value); }
// rules: 1–253 chars, case-sensitive, no '/', '%', whitespace, control chars; not ".", "..", "~" (contract §7.2)
public enum UserRole { User = 0, Admin = 1 }
public enum UserStatus { Pending, Active, Deactivated }
public enum RoleChangeSource { Manual, Configuration }

public sealed class User : AggregateRoot<UserId>
{
    public Username Username { get; }
    public string? DisplayName { get; }
    public bool IsAdminByAssignment { get; }
    public string? AdminConfigurationSource { get; }        // "user list" | "group <name>" | null
    public UserRole Role { get; }                            // computed: assignment || config source
    public bool IsReadOnly { get; }
    public bool IsDeactivated { get; }
    public UserStatus Status { get; }                        // computed: Deactivated > Pending (LastLoginAt null) > Active
    public DateTimeOffset? LastLoginAt { get; }
    public IReadOnlyList<string> Groups { get; }             // OCP groups at last login
    public Guid SecurityStamp { get; }                       // rotated by Deactivate
    public DateTimeOffset CreatedAt { get; }
    public string CreatedBy { get; }
    public bool IsActiveWritableAdmin { get; }               // Role == Admin && !IsDeactivated && !IsReadOnly

    public static User PreCreate(Username username, UserRole role, bool isReadOnly, string createdBy, DateTimeOffset now); // UserCreated
    public static User Provision(Username username, DateTimeOffset now);   // UserProvisioned; CreatedBy = username; caller then calls RecordLogin
    public Result RecordLogin(string? displayName, IReadOnlyList<string> groups, string? adminConfigurationSource, bool provisioned, DateTimeOffset now);
        // fails with UserErrors.Deactivated when deactivated; raises UserLoggedIn, and UserRoleChanged(Source=Configuration)
        // when the effective role changed because the configuration source changed
    public Result ChangeRole(UserRole role, UserId actingUserId, int activeWritableAdminCount);
        // Admin → sets IsAdminByAssignment; User → clears it. Errors: AdminViaConfiguration (demote while config source set),
        // SelfChange (demote self), LastAdmin. Same effective role → success, no event.
    public Result SetReadOnly(bool isReadOnly, int activeWritableAdminCount);      // LastAdmin when making the last one read-only
    public Result Deactivate(UserId actingUserId, int activeWritableAdminCount);   // SelfChange, LastAdmin; rotates SecurityStamp
    public Result Reactivate();
}
```
`activeWritableAdminCount` = number of users (including this one) for which `IsActiveWritableAdmin` is true, read by
the handler from the DB. The rule: if this user is an active writable admin, the change would remove that, and the
count is ≤ 1 → `UserErrors.LastAdmin`. Idempotent calls (already deactivated, same flag) succeed without an event.

Events (`sealed record ... : IDomainEvent`, carry ids **and** the username for audit):
`UserCreated(UserId, string Username, UserRole Role, bool IsReadOnly)`, `UserProvisioned(UserId, string Username)`,
`UserLoggedIn(UserId, string Username, IReadOnlyList<string> Groups, bool Provisioned)`,
`UserRoleChanged(UserId, string Username, UserRole OldRole, UserRole NewRole, RoleChangeSource Source, string? ConfigurationSource)`,
`UserReadOnlyChanged(UserId, string Username, bool IsReadOnly)`, `UserDeactivated(UserId, string Username)`,
`UserReactivated(UserId, string Username)`.

`public static class UserErrors` — factories returning `Error` with the codes/messages of contract §2:
`NotFound(string username)`, `UsernameTaken(string username)`, `LastAdmin(string username)`, `SelfChange()`,
`AdminViaConfiguration(string source)`, `Deactivated()` (code `Users.Deactivated`, used by login only, never
reaches HTTP).

**Audit** (`Domain/Audit/`)
```csharp
public readonly record struct AuditEntryId(Guid Value) { public static AuditEntryId New(); }   // v7
public enum AuditCategory { Auth, Users, Clusters, Credentials, Grants }
public enum AuditTargetType { Session, User, Cluster, Credential, Grant }
public sealed record AuditActor(UserId? UserId, string Name, bool IsSystem)
{
    public static AuditActor Configuration { get; }          // (null, "system (config)", true)
    public static AuditActor ForUser(UserId id, string username);
    public static AuditActor Anonymous(string claimedUsername);   // denied logins of unknown users
}
public sealed class AuditEntry : AggregateRoot<AuditEntryId>   // append-only: no mutators
{
    public static AuditEntry Record(AuditActor actor, string action, AuditTargetType targetType, string? targetId,
        string targetName, string? clusterName, string summary, string? correlationId, string detailsJson,
        DateTimeOffset occurredAt);
    // properties for every argument + Category, derived from the action prefix:
    // auth.→Auth, user.→Users, cluster.→Clusters, credential.→Credentials, grant.→Grants; other prefixes → ArgumentException
}
```
Action strings match `^[a-z]+\.[a-z_]+$` (guard). `detailsJson` must be a JSON object string (guard: starts with `{`).

## Acceptance criteria
- [ ] QG-1 (users part): unit tests for last-admin protection (demote/deactivate/read-only), self-change, config-sourced
      demote refused, manual+config admin stays admin after config removal (ADR-0009), stamp rotation on deactivate,
      idempotent transitions raise no events, `RecordLogin` on deactivated user fails (AUTH-7), Status derivation (USR-1).
- [ ] Username rules (USR-2) table-tested, including the invalid examples in contract §7.2.
- [ ] AuditEntry derives category, rejects bad action/details, has no mutators (AUD-3).
- [ ] XML docs on every public type/member; Domain still references only the BCL (architecture tests green).
- [ ] Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
