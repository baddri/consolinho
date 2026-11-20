---
id: T-0007
title: Domain model — users, audit entries, aggregate version
status: done
owner: backend-engineer
checkpoint: 1
depends_on: []
paths: [src/FleetConsole.Domain/Common/AggregateRoot.cs, src/FleetConsole.Domain/Users/, src/FleetConsole.Domain/Audit/, tests/FleetConsole.Domain.Tests/]
review_rounds: 2
---

## Goal
Model FleetConsole users (OCP identity, effective role from two sources, read-only, deactivation, security stamp,
last-admin protection) and the append-only audit entry, as pure Domain code with unit-tested invariants. Everything in
CP1 that authenticates, authorizes or audits builds on these types. **Parallel group W1** (with T-0009, T-0010).

## Scope
- In: `AggregateRoot.Version`; `Domain/Users/*`; `Domain/Audit/*`; domain errors; domain events; unit tests.
- Out: persistence (T-0012), Application use cases, clusters/credentials/grants (T-0008).

## Contract / design notes
Read ADR-0009 (role sources, security stamp), ADR-0017 (promote records the assignment), ADR-0008 (audit), contract `docs/specs/CP1-api-contract.md` §2, §3, §10.

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
        // Admin → sets IsAdminByAssignment, also when already admin via configuration (ADR-0017: raises
        // UserRoleChanged(Admin→Admin, Manual, ConfigurationSource = current source)); no-op only if already assigned.
        // User → clears it; no-op when effective role is already User. Errors: AdminViaConfiguration (demote while
        // config source set), SelfChange (demote self), LastAdmin. Manual events carry ConfigurationSource =
        // AdminConfigurationSource at the time (null except in the Admin→Admin case).
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
- [x] QG-1 (users part): unit tests for last-admin protection (demote/deactivate/read-only), self-change, config-sourced
      demote refused, manual+config admin stays admin after config removal (ADR-0009), stamp rotation on deactivate,
      idempotent transitions raise no events, `RecordLogin` on deactivated user fails (AUTH-7), Status derivation (USR-1).
- [x] Username rules (USR-2) table-tested, including the invalid examples in contract §7.2.
- [x] AuditEntry derives category, rejects bad action/details, has no mutators (AUD-3).
- [x] XML docs on every public type/member; Domain still references only the BCL (architecture tests green).
- [x] Build, lint and tests green (CLAUDE.md rule 4).

## Work log
- 2026-11-18 backend-engineer: started; read CLAUDE.md, BACKEND.md, SECURITY.md, ADR-0008/0009/0013, contract §2/§3/§7/§10.
- 2026-11-18 backend-engineer: (resumed after a rate-limit interruption; nothing had been written to disk yet.)
  Added `AggregateRoot.Version` (uint, private setter, doc says only persistence/`xmin` sets it); `Domain/Users/`
  (UserId, Username, UserRole, UserStatus, RoleChangeSource, UserErrors, User, `Events/` x7); `Domain/Audit/`
  (AuditEntryId, AuditCategory, AuditTargetType, AuditActor, AuditEntry); 6 new test files under `tests/FleetConsole.Domain.Tests/{Users,Audit,Common}`.
  `dotnet build FleetConsole.slnx -warnaserror` green; `dotnet test FleetConsole.slnx` green (Domain 150, Application
  35, Api 67 incl. Testcontainers via podman). No files outside `paths` touched. No migration: no aggregate is mapped
  yet (T-0012 maps `Version` to `xmin`).
- 2026-11-18 backend-engineer: review round 1 fixes (ADR-0017). `User.ChangeRole` promote: idempotency now judged on
  `IsAdminByAssignment`; manual `UserRoleChanged` carries the current `AdminConfigurationSource` instead of `null`.
  XML docs updated on `ChangeRole`, the `User` remarks and `UserRoleChanged`. Replaced
  `ChangeRole_PromoteConfigurationAdmin_IsNoOp` with three tests: config-only promote, role survives leaving the
  group, and repeated promote is a no-op (theory over manual and manual+config). Added a null-`ConfigurationSource`
  assertion to the plain promote test. Handover bullets updated. Optional `Groups` backing-field remark left to T-0012.
  Checks: Domain and Domain.Tests build `-warnaserror` green and Domain tests 153/153 pass.
  **`dotnet build FleetConsole.slnx -warnaserror` currently fails outside this task.** CA1716 in the untracked,
  parallel-agent file `src/FleetConsole.Application/Abstractions/Kubernetes/IClusterProbeSession.cs:44` (parameter
  named `namespace`). Because Application doesn't build, the Application and Api test suites could not run in this round
  (they passed in round 1 and the reviewer's run). Not fixed here: the file is outside T-0007's `paths`.

## Review
**Round 1 — 2026-11-18, backend-architect: CHANGES_REQUESTED**

Checks run by reviewer: `dotnet build FleetConsole.slnx -warnaserror` green (0 warnings); `dotnet test FleetConsole.slnx`
green (Domain 150, Application 35, Api 67).

Required:
1. `src/FleetConsole.Domain/Users/User.cs:218-222` (`ChangeRole`, `if (role == oldRole) return Success`) — promoting a
   user who is admin via configuration only is a no-op, so the user loses admin when they leave the group even though an
   admin explicitly promoted them. Orchestrator product ruling, recorded in ADR-0017 (contract §7.2 and §10 updated) —
   required fix:
   - `role == Admin`: no-op only when `IsAdminByAssignment` is already true. Otherwise set it and raise
     `UserRoleChanged(Id, Username, oldRole, UserRole.Admin, RoleChangeSource.Manual, ConfigurationSource:
     AdminConfigurationSource)`; `oldRole` is `Admin` for a config-only admin.
   - `role == User`: keep the current behaviour (no-op when `Role == User`; then AdminViaConfiguration → SelfChange →
     LastAdmin).
   - Manual events: `ConfigurationSource` = `AdminConfigurationSource` at the time of the change, instead of the
     literal `null` (it is null for every manual change except the config-admin promote). Update the XML docs on
     `ChangeRole`, the class `<remarks>` (the "Idempotency" paragraph says transitions to the *current state* are
     no-ops; make it clear that for promote the state is the assignment, not the effective role) and
     `UserRoleChanged.ConfigurationSource`.
2. `tests/FleetConsole.Domain.Tests/Users/UserTests.cs:333` (`ChangeRole_PromoteConfigurationAdmin_IsNoOp`) — encodes
   the old rule. Replace with: (a) promote config-only admin → `IsAdminByAssignment` true, one `UserRoleChanged`
   Admin→Admin, Manual, `ConfigurationSource` = the source; (b) after that, `RecordLogin` with no config source keeps
   Admin and raises no role event; (c) promoting a manual (or manual+config) admin again → no event.
   (`ChangeRole_ToCurrentRole_SucceedsWithoutEvent` uses an assigned admin and stays valid.) Assert
   `ConfigurationSource` is null in `ChangeRole_Promote_SetsAssignment_AndRaisesManualEvent`.
3. Handover notes — replace the "Promote of a config-only admin is a no-op" bullet with the new behaviour, and update
   the "`UserRoleChanged.ConfigurationSource`" bullet for manual changes.

Other handover choices, evaluated, all accepted:
- `UserErrors.InvalidUsername` (Validation) with rule-specific messages, `Username.MaxLength` public: accepted. Username
  rules stay in one place; T-0016's validator must use `Username.Create`.
- `UserErrors.Deactivated` as `Forbidden`, `NotFound` message text: accepted.
- `ConfigurationSource` on config-driven changes = new source on promotion, former on demotion: accepted (matches §10).
- Check order (idempotent first; demote AdminViaConfiguration → SelfChange → LastAdmin; deactivate SelfChange →
  LastAdmin): accepted. AdminViaConfiguration first gives the most actionable message.
- `RecordLogin` normalization, no state change on a deactivated user, `UserLoggedIn` before `UserRoleChanged`:
  accepted.
- Persistence hints, `AuditEntry.Record` guards (`\z`, structural `{…}` check, no events): accepted.

Optional (no re-review needed):
- `User.Groups = [.. groups]` produces a compiler-synthesized read-only list. T-0012 may need a `List<string>` backing
  field for the EF primitive collection. Leave it to T-0012 unless it is trivial now.

**Round 2 — 2026-11-18, backend-architect: APPROVE**

Checks run by reviewer: `dotnet build src/FleetConsole.Domain -warnaserror` green (0 warnings);
`dotnet test tests/FleetConsole.Domain.Tests` green (153/153). The full solution build was not judged: it currently
fails with CA1716 in an untracked file from the in-progress T-0010 work
(`src/FleetConsole.Application/Abstractions/Kubernetes/IClusterProbeSession.cs`), which is outside this task. Nothing
outside Domain uses the changed code yet.

Round 1 findings:
1. Fixed. `ChangeRole` promote is a no-op only when `IsAdminByAssignment` is already true. A config-only admin gets
   `UserRoleChanged(Admin→Admin, Manual, <source>)`. Demote behaviour and check order are unchanged. Manual events carry
   `AdminConfigurationSource`. The XML docs (class remarks, `ChangeRole`, `UserRoleChanged`) match ADR-0017.
2. Fixed. `ChangeRole_PromoteConfigurationOnlyAdmin_RecordsAssignment_WithSameRoleEvent`,
   `ChangeRole_PromotedConfigurationAdmin_StaysAdminAfterLeavingConfigGroup` and
   `ChangeRole_PromoteAdminByAssignmentAgain_SucceedsWithoutEvent` (manual, and manual+config) replace the old no-op
   test. The plain promote test asserts a null `ConfigurationSource`.
3. Fixed. The handover bullets describe the new behaviour and the T-0013 mapping rule.

The optional `Groups` backing-field remark is still left to T-0012, as agreed.

## Handover notes
**Done.** All contract types from this task exist as specified. Additions/choices the next tasks should know about:

- **Extra error `UserErrors.InvalidUsername(message)`** (code `Users.InvalidUsername`, Validation). `Username.Create`
  returns it with a rule-specific message ("Username is required.", "Username must be at most 253 characters long.",
  "Username can't be '.', '..' or '~'.", "Username can't contain '/', '%' or whitespace.", "Username can't contain
  control characters."). The create-user use case validator should call `Username.Create` and surface `Error.Message`
  as the `username` field error, so rules live in one place. Not in contract §2 because it never reaches HTTP as a
  `code` (it becomes a `Validation.Failed` field error). Whitespace-only input is reported as "required".
  `Username.MaxLength = 253` is public for the column length.
- **`UserErrors.Deactivated()` is `ErrorType.Forbidden`** (never reaches HTTP per contract; type chosen for sanity).
  `UserErrors.NotFound` message: "User {username} was not found." (contract gives no text).
- **`UserRoleChanged.ConfigurationSource`:** on a config-driven change (`Source = Configuration`) it is the source
  responsible: the *new* source on promotion, the *former* source on demotion (so `user.demoted` details say which
  group was left). On a manual change (`Source = Manual`) it is the user's `AdminConfigurationSource` at the time.
  That is non-null only when promoting a config admin, because demote is refused while a source is set (ADR-0017).
- **Check order** in `ChangeRole` demote: AdminViaConfiguration → SelfChange → LastAdmin; in `Deactivate`:
  idempotent → SelfChange → LastAdmin. Idempotent calls short-circuit *before* any check (e.g. "deactivate self" on an
  already-deactivated user succeeds). Clearing read-only never hits LastAdmin.
- **Promote always records the assignment (ADR-0017).** `ChangeRole(Admin)` is a no-op only when
  `IsAdminByAssignment` is already true. Promoting a config-only admin sets it and raises
  `UserRoleChanged(Admin→Admin, Manual, ConfigurationSource = current source)`, and the user stays admin after leaving
  the config group. Because `OldRole` can equal `NewRole`, the audit mapping (T-0013) must pick `user.promoted` /
  `user.demoted` from `NewRole`. Demote is unchanged: no-op when the effective role is User, otherwise
  AdminViaConfiguration → SelfChange → LastAdmin.
- `RecordLogin` normalizes blank `displayName`/`adminConfigurationSource` to null, copies `groups` into an immutable
  list, and on a deactivated user returns the error with **no** state change. `UserLoggedIn` is raised before
  `UserRoleChanged`.
- **Persistence hints for T-0012:** `User` and `AuditEntry` have private parameterless ctors; immutable properties use
  `private init`, mutable ones `private set`. `User.Role`, `Status`, `IsActiveWritableAdmin` are computed (ignore in
  EF). `User.Groups` is `IReadOnlyList<string>` with a private setter (primitive collection / `text[]`).
  `AuditActor` is a record with a guarded `Name` (owned type / complex type candidate); `AuditActor.ConfigurationName`
  constant = `"system (config)"`. `AuditEntry.DetailsJson` holds the JSON string (map to `jsonb`).
- `AuditEntry.Record` guards: action `^[a-z]+\.[a-z_]+\z` (`\z`, so a trailing newline is rejected) with a known
  prefix, details trimmed must start with `{` and end with `}` (no full JSON parse in Domain), non-blank target name and
  summary, non-default timestamp, defined target type. `AuditEntry` raises no domain events (it must not, ADR-0008).
- Ids use `Guid.CreateVersion7()`.
