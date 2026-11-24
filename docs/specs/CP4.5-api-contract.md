# CP4.5a — Admin API contract (group grants, Groups, Effective access)

Owner: backend-architect. Consumers: frontend-architect (T-0260+). The Api's OpenAPI document is the final source;
the FE regenerates types (`npm run gen:api`, EFF-6). JSON is camelCase, enums are camelCase strings (`JsonSetup`).
Errors are RFC 9457 ProblemDetails with `code`; validation = **400** with the `errors` field map, as today.
All routes are under `/api/admin`, require role Admin; mutating ones are refused for read-only admins (`Auth.ReadOnly`).
Spec: `docs/specs/CP4.5-access-at-scale.md` §4.1–4.5. Decisions: ADR-0034, ADR-0039.

## 1. Shared types

```ts
type GrantSubjectKind = "user" | "group";
type HostGroupsStatus = "ok" | "forbidden" | "unavailable";
// forbidden  = FleetConsole's host SA lacks get/list groups (show GPG-4 hint / UIG-2 alert)
// unavailable = host unreachable, timeout, or listing not configured (same UIG-2 alert)
```

### `Grant` (schema changed — existing endpoints return it)
Added: `subjectKind`, `subjectName`, `priority`. Now **nullable** (null for group grants): `username`,
`userDisplayName`, `userStatus`. Everything else unchanged.
```ts
interface Grant {
  id: string; subjectKind: GrantSubjectKind;
  subjectName: string;            // username or group name (always set)
  priority: number | null;        // 1..1000 for groups, null for users
  username: string | null; userDisplayName: string | null; userStatus: UserStatus | null;
  clusterName: string; clusterDisplayName: string; clusterEnvironment: ClusterEnvironment; clusterIsEnabled: boolean;
  credentialId: string; credentialName: string; credentialExpiryStatus: CredentialExpiryStatus;
  credentialExpiresAt: string | null; credentialLastTest: ConnectionTestSummary | null;
  accessMode: AccessMode; grantedAt: string; grantedBy: string;
  updatedAt: string | null; updatedBy: string | null; version: number;
}
```

## 2. Grants (existing routes, changed behaviour)

| Route | Change |
|---|---|
| `GET /clusters/{name}/grants` | Returns **user and group** grants. Order: `subjectKind` (user, group), then `subjectName` ordinal. Used priorities of a cluster = its group grants' `priority` (UIG-3). |
| `GET /users/{username}/grants` | Unchanged: **direct** grants only (Cluster access tab). |
| `PUT /grants/{grantId}` | `UpdateGrantRequest` gains `priority?: number \| null`: **required** (1–1000) for group grants, must be absent/null for user grants. |
| `DELETE /grants/{grantId}` | Unchanged; works for both kinds. |
| `POST /grants`, `POST /users/{username}/grants/bulk` | Unchanged (user subject). |

## 3. Group grants (new)

`{groupName}` is a URL-encoded path segment. Valid names (GRP-6): trimmed, 1–253 chars, not `.`/`..`, no `/`, `%`,
`:` or control characters; ordinal (case-sensitive) like OpenShift.

| Route | Body | Success | Errors |
|---|---|---|---|
| `GET /groups/{groupName}/grants` | — | 200 `Grant[]` (order: `clusterName`) | — (unknown/invalid name → `[]`) |
| `POST /groups/{groupName}/grants` | `CreateGroupGrantRequest` | 201 `Grant`, `Location: /api/admin/grants/{id}` | 400, 404, 409 |
| `POST /groups/{groupName}/grants/bulk` | `BulkGroupGrantRequest` | same as `POST /users/{u}/grants/bulk` | 400 (per-item), 409 |

```ts
interface CreateGroupGrantRequest { clusterName: string; credentialId: string; accessMode?: AccessMode /* default readOnly */; priority: number }
interface BulkGroupGrantRequest  { accessMode: AccessMode; priority: number; items: BulkGrantItem[] /* {clusterName, credentialId}, max 100 */ }
```

Error codes (messages are the user-facing copy):

| Code | Status | Field | Message |
|---|---|---|---|
| validation | 400 | `groupName` | `System groups can't be granted access.` (name starts with `system:`, any case — GRP-3; checked first) |
| validation | 400 | `groupName` | `Enter a valid group name.` (GRP-6) |
| validation | 400 | `priority` | `Priority must be between 1 and 1000.` (GRP-2; also when missing) |
| validation | 400 | `priority` | `Priority applies to group grants only.` (PUT on a user grant) |
| `Grants.AlreadyExists` | 409 | — | `Group "X" already has access to "C".` (GRP-5) |
| `Grants.PriorityTaken` | 409 | — | ``Priority N is already used by group `X` on this cluster.`` (GRP-4; FE shows it on Priority) |
| `Clusters.NotFound` / credential errors | 404 / 400 | as `POST /grants` today | |

**Bulk (GPG-3)** is all-or-nothing like the user bulk: when any item fails nothing is written and the 400 lists
**every** failing item as `items[i].clusterName` (priority taken, already granted, cluster not found) /
`items[i].credentialId` (credential not in cluster). The wizard flags those clusters in the review step and lets the
admin deselect them and resubmit — no partial silent failure.

Audit (GRP-7): `grant.created` / `grant.changed` / `grant.revoked` with target name ``group X → C``, details
`{ subjectKind, groupName, priority, accessMode, credential }`; the audit `target` filter finds them by group name
(`grant.changed` details carry `oldPriority`/`newPriority`). Revalidation (ADR-0039) records `user.groups_changed`
(category Users, target the user, actor `system (revalidation)`, details `{ added, removed }`).

## 4. Groups (new, GPG-1/2/4, UIG-2)

Host data comes from FleetConsole's host SA (ADR-0039), at most 15 s old. Listing failures never fail these
endpoints: they return 200 with `hostStatus` ≠ `ok` and whatever FleetConsole knows from its grants.

`GET /groups` → `GroupList` — host groups ∪ groups named in grants, `system:*` excluded, sorted by name.
The picker typeahead (UIG-2) uses this list and filters client-side.
```ts
interface GroupList { hostStatus: HostGroupsStatus; hostReadAt: string | null; items: GroupRow[] }
interface GroupRow {
  name: string;
  foundOnHost: boolean | null;    // null when hostStatus != ok; false → "Not found on host cluster" label
  memberCount: number | null;     // null when unknown → "-" (Q7)
  clusterCount: number;           // number of group grants
}
```

`GET /groups/{groupName}` → `GroupDetail`; **404 `Groups.NotFound`** when the name is invalid, or when the host
listing is `ok`, the group isn't on the host and has no grants.
```ts
interface GroupDetail {
  name: string; hostStatus: HostGroupsStatus; hostReadAt: string | null;
  foundOnHost: boolean | null; clusterCount: number;
  members: GroupMember[] | null;  // host Group.users, ordinal order; null when unknown
}
interface GroupMember {
  username: string;
  isRegistered: boolean;          // a FleetConsole user exists → link to /fleet/admin/users/{username}
  displayName: string | null; status: UserStatus | null;   // null when not registered
}
```
The group's Cluster access tab = `GET /groups/{groupName}/grants`.

## 5. Effective access (new, EFF-1..5)

`GET /users/{username}/effective-access` → `EffectiveAccess`; 404 `Users.NotFound`. Computed by the same resolver
as the proxy and the switcher (PREC-8), from the **stored** read-only flag. Rows = clusters the user can open:
enabled clusters with a winning grant; deactivated user → `clusters: []`. Sorted by cluster name.
```ts
interface EffectiveAccess {
  username: string; userIsReadOnly: boolean; userStatus: UserStatus;
  groups: string[];               // recorded membership (system:* never present)
  groupsAsOf: string | null;      // last login or revalidation check (EFF-4); null if never logged in
  clusters: EffectiveClusterAccess[];
}
interface EffectiveClusterAccess {
  clusterName: string; clusterDisplayName: string; clusterEnvironment: ClusterEnvironment;
  accessMode: AccessMode;         // effective mode, after the read-only flag
  narrowedByReadOnlyFlag: boolean;// PREC-6: winner was readWrite, user flag made it readOnly
  source: AccessSource;
  credentialId: string; credentialName: string;
  candidates: AccessCandidate[];  // every matching grant, winner first, then by priority desc
}
interface AccessSource { kind: GrantSubjectKind; groupName: string | null; priority: number | null }
// UI: kind=user → "Direct grant"; kind=group → "Group `X` (priority N)"
interface AccessCandidate {
  grantId: string; subjectKind: GrantSubjectKind; subjectName: string; priority: number | null;
  accessMode: AccessMode; credentialName: string;
  outcome: "winner" | "overriddenByDirectGrant" | "lowerPriority" | "tieReadOnlyWins" | "tieBrokenById";
  beatenBy: string | null;        // lowerPriority/tie*: winning group's name; overriddenByDirectGrant: null
}
```
EFF-2 copy: `overriddenByDirectGrant` → "Overridden by direct grant"; `lowerPriority` → "Lower priority than `X`";
`tieReadOnlyWins` → "Tie: read-only wins"; `tieBrokenById` → "Tie: older grant wins" (should not happen: priorities
are unique per cluster in the database); winner row with `narrowedByReadOnlyFlag` → "Narrowed to read-only by the
user's read-only flag".
