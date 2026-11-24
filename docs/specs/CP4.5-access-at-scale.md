# CP4.5 — Access at scale (spec)

Status: draft (product owner, 2026-11-24) · branch `cp/4.5-access-at-scale` · decisions: ADR-0034 (group grants,
precedence), ADR-0035 (access cache). This spec turns them into acceptance criteria; it does not re-decide them.

**Split.** Two sub-checkpoints, each merged and tagged on its own (like CP4a/b/c):
- **CP4.5a — Group grants** (§4.1–4.5): subject kind, precedence, group picker, Groups page, effective access, T-0241.
- **CP4.5b — Access cache** (§4.6–4.8): FusionCache/HybridCache, Redis, invalidation, load re-test (T-0242 follow-up).

## 1. Problem and goal

Today an admin grants each of ~40 clusters to each user one by one (bulk wizard helps, but per user). Teams already
exist as host OpenShift `Group`s; a new SRE joining `sre-emea` should get the team's clusters at first login with no
FleetConsole admin work, and lose them when removed from the group. With more grants and more replicas, the one
authorization query per proxied request (ADR-0019) becomes the hot path; it must be cached without ever serving a
revoked grant.

Goal: grants to **groups** with a deterministic, explainable winner (ADR-0034), an admin **Effective access** view that
uses the same resolver as authorization, and a **shared, precisely invalidated access cache** (ADR-0035).

## 2. Personas

- **Anna — fleet admin.** Manages teams, not individuals. Wants "give `sre-emea` read-only on all prod, edit on dev".
- **Sam — SRE (group member).** Never talks to Anna; logs in and expects his team's clusters in the switcher.
- **Ines — read-only auditor.** Her user read-only flag must win over any group grant.
- **Olga — platform operator.** Runs FleetConsole on 3+ replicas; cares about Redis outages and Postgres load.

## 3. User stories

- As Anna, I want to grant a host group access to a cluster so that membership on the host drives access.
- As Anna, I want to pick the group from the host's `Group` list (or type one that doesn't exist yet) so that I don't mistype it.
- As Anna, I want to set a priority on group grants so that a user in two groups gets a predictable access mode.
- As Anna, I want to see, for a user, which grant wins on each cluster and why, so that I can answer "why can Sam edit prod?".
- As Anna, I want to grant a group many clusters at once so that onboarding a team is one action.
- As Sam, I want access from my groups at first login and to lose it soon after removal, without anyone touching FleetConsole.
- As Olga, I want a revoke on one replica to apply on all replicas immediately, and a Redis outage never to widen access.

## 4. Acceptance criteria

Conventions: "grant" = (subject, cluster, credential, access mode[, priority]). "Resolver" = the ADR-0034 domain
service. Exact type, endpoint and field names are the architects' call unless quoted here.

### 4.1 Group subject and validation (GRP) — CP4.5a
- **GRP-1** A grant's subject is `User` or `Group`. Group subject = host `Group` name (string, no FK). Existing grants migrate as `User` subjects with no behaviour change; existing grant tests pass unchanged.
- **GRP-2** Group grants carry an integer **priority** (required for groups, absent for users; range 1–1000; higher wins). Validation errors are RFC 9457 field errors.
- **GRP-3** Given a group name starting with `system:` (any case), creating or updating a group grant returns a field error "System groups can't be granted access." `system:*` entries in `User.Groups` are ignored by the resolver.
- **GRP-4** Given a group grant on cluster C with priority N, saving another group grant on C with priority N returns 409/field error naming the other group: "Priority N is already used by group `X` on this cluster."
- **GRP-5** One grant per (subject, cluster): a second grant for the same group on the same cluster is refused like duplicate user grants today.
- **GRP-6** Group names follow Kubernetes object-name rules for `groups.user.openshift.io` (validator), trimmed; free text allowed for groups that don't exist yet.
- **GRP-7** Audit entries for create/update/revoke of a group grant name the subject kind, group name and priority (Audit log filter can find them by group name).

### 4.2 Membership and precedence (PREC) — CP4.5a
- **PREC-1** Membership = `User.Groups` recorded at login. Session revalidation (ADR-0009) re-reads the user's groups from the host; Given Sam is removed from `sre-emea` on the host, When `Auth:RevalidationInterval` elapses, Then his next proxied request on a cluster granted only via `sre-emea` returns 403 and the cluster leaves his switcher. Access decisions never call the host per request.
- **PREC-2** Given a group member with no FleetConsole user yet and `Auth:AutoProvision` on, When he logs in, Then he sees the group's clusters without admin action.
- **PREC-3** Direct user grant beats every group grant on that cluster (even a read-write group grant over a read-only user grant).
- **PREC-4** Among group grants, the highest priority wins; its credential and access mode apply.
- **PREC-5** If two matching group grants still share a priority (concurrent save, renamed group), the read-only one wins; if both are equal in mode, the resolver is deterministic (documented tiebreak, e.g. lower grant id) and logs a warning.
- **PREC-6** The user's read-only flag always applies on top: the effective mode is read-only even if the winning grant is read-write.
- **PREC-7** Disabled users, disabled clusters and revoked/disabled credentials behave as today, whatever the subject kind.
- **PREC-8** One resolver implementation is used by the proxy authorization query, the accessible-clusters query (switcher) and Effective access. Unit tests cover every rule above (table-driven: direct vs group, priorities, tie, RO flag, `system:*`, no match).

### 4.3 Admin UI: grant to a group (UIG) — CP4.5a
- **UIG-1** The cluster's **Access** tab "Grant access" modal gets a **Subject** section mirroring OCP's RoleBinding form (`RBAC/bindings.tsx`): radio group "User" / "Group" (User default), then "Subject name". Changing kind clears the name.
- **UIG-2** For Group, "Subject name" is a typeahead listing host `Group` objects read through FleetConsole's own SA (`get/list groups.user.openshift.io`), with "Use "`<typed>`"" for free text. If listing fails (403/unreachable), an inline info alert "Could not list groups on the host cluster. You can still type a group name." and free text works.
- **UIG-3** For Group, a "Priority" `NumberInput` appears with helper text "When a user is in several groups with access to this cluster, the highest priority wins. A direct user grant always wins." The used priorities on this cluster are shown in the helper or validated inline (GRP-4).
- **UIG-4** The Access tab table gets columns in OCP RoleBinding-list order: **Subject kind** (`User`/`Group` label), **Subject name** (user link / group link to §4.4), Access mode, **Priority** (`-` for users), Credential, Granted. Filter by subject kind; kebab "Edit access" / "Revoke access" work for both kinds; confirmations name the group and the cluster.
- **UIG-5** Production write warning (existing) shows for read-write group grants too, and names the group: "Members of `X` will be able to change resources on `<cluster>`."
- **UIG-6** Read-only admins see all of the above, with mutating actions disabled with tooltip as today.

### 4.4 Groups page and bulk (GPG) — CP4.5a
- **GPG-1** Fleet administration gets a **Groups** list (after Users), mirroring OCP's User Management > Groups list: Name, Users (member count from host, `-` if unknown), Clusters (number of group grants). It lists host groups plus groups that only exist in grants (marked "Not found on host cluster" label). `system:*` groups are not listed.
- **GPG-2** Group detail page tabs: **Details** (name, members from the host `Group.users`, each linked to the FleetConsole user if one exists) and **Cluster access** (the group's grants, same table/actions as a user's Cluster access tab).
- **GPG-3** "Grant access" on a group's Cluster access tab opens the existing bulk wizard with the group as subject, plus one priority for all selected clusters; clusters where that priority is taken are flagged in the review step and skipped or refused per cluster (no partial silent failure).
- **GPG-4** Empty states: no host groups and no group grants → "No groups found" with a hint that the host SA needs `list groups`.

### 4.5 Effective access (EFF) — CP4.5a
- **EFF-1** The user detail page gets an **Effective access** tab: one row per cluster where the user has access: Cluster (with environment label), Effective access mode, **Source** ("Direct grant" / "Group `X` (priority N)"), Credential.
- **EFF-2** Each row expands to all candidate grants for that cluster with the reason each lost: "Overridden by direct grant", "Lower priority than `X`", "Tie: read-only wins", and "Narrowed to read-only by the user's read-only flag" when PREC-6 applies.
- **EFF-3** The rows equal what the user's switcher shows (same resolver, PREC-8) — tested by comparing the admin query and the user's accessible-clusters query for one fixture.
- **EFF-4** Groups shown are the user's recorded groups with the "as of" time of the last login/revalidation, so Anna knows how fresh membership is.
- **EFF-5** Empty state: "`<user>` has no access to any cluster." with links to Cluster access and Groups.
- **EFF-6** (T-0241) Admin API types are regenerated with `npm run gen:api` against the running Api; the POL-4 hand edits and the new group/effective-access shapes come from generation only.

### 4.6 Access cache (CACHE) — CP4.5b
- **CACHE-1** The authorization (and accessible-clusters) result is cached through `HybridCache` implemented by FusionCache: memory L1, Redis L2, Redis backplane. Caching lives in a pipeline behavior / proxy policy, not in handlers.
- **CACHE-2** Entries are tagged `user:{id}`, `cluster:{id}`, `credential:{id}`, `group:{name}`. After commit, grant/user/cluster/credential domain events (and a membership change on revalidation) invalidate the matching tags.
- **CACHE-3** Given 2 replicas and a cached grant, When the admin revokes it on replica A, Then the next request on replica B is refused (backplane), without waiting for TTL.
- **CACHE-4** TTL backstop ≤ 60 s (configurable); a missed invalidation heals within it.
- **CACHE-5** Fail-safe is **off** for authorization entries: with the database unreachable and an expired entry present, the request fails (503 ProblemDetails), never uses the stale entry.
- **CACHE-6** The decrypted SA token exists only in L1/process memory. Redis holds only Data Protection ciphertext and ids — tested by scanning every Redis value written during a test run for the fixture token.
- **CACHE-7** Redis down: requests keep working from L1 + database, a warning is logged and the health check reports degraded, not unhealthy; access is never widened.
- **CACHE-8** `BACKEND.md` §Recipes lists keys, tags and invalidating events (replaces "Adding a cache later").

### 4.7 Redis and deploy (OPS) — CP4.5b
- **OPS-1** Redis in the Aspire AppHost (container, podman) and in kustomize manifests (no persistence, password in a Secret, NetworkPolicy allowing only the FleetConsole pods). `scripts/check-deploy.sh` green.
- **OPS-2** Deployed to consolinho after the checkpoint; HPA with ≥ 2 replicas shows CACHE-3 live (revoke on one pod, refused on the other).
- **OPS-3** (T-0242 follow-up) The k6 load test (`deploy/loadtest/`) is re-run with the same mix; Postgres CPU per request and p95 are recorded next to the T-0242 baseline (p95 71 ms, Postgres peak 177m); requests/HPA are changed only if the data says so.

### 4.8 Quality gates (QG)
- **QG-1** `scripts/check-be.sh` and `scripts/check-fe.sh` green at each sub-checkpoint.
- **QG-2** e2e (Playwright, CP4.5a): grant a group read-only to a cluster → member logs in, sees the cluster, write actions disabled; Effective access shows "Group `X` (priority N)"; add a direct read-write grant → Effective access switches to "Direct grant".
- **QG-3** Security tests: `system:*` refused at save and ignored in membership (GRP-3); group removal takes effect after revalidation (PREC-1); RO flag narrows (PREC-6).
- **QG-4** Security tests (CP4.5b, Testcontainers Redis): decrypted token never in Redis (CACHE-6); fail-safe off (CACHE-5); stale-grant invalidation across two app instances sharing Redis (CACHE-3).
- **QG-5** ux-designer pass on the Subject section, Access tab columns, Groups and Effective access against the OCP references (`RBAC/bindings.tsx`, Groups list), recorded in `ocp-parity.md`.

## 5. UX notes

- **Subject section**: PF `FormSection title="Subject"`, `Radio` stack, then `FormGroup label="Subject name"` — same wording as OCP. Priority as PF `NumberInput` (min 1), only for Group.
- **Kind labels**: PF `Label isCompact` "User"/"Group" in tables; group name links to the Groups detail.
- **Effective access**: PF `Table` with expandable rows (`ExpandableRowContent`); the Source column is the one-line answer, the expansion is the "why".
- **Error states**: listing host groups failing never blocks granting (UIG-2); Effective access load failure is an inline `ErrorState` with Retry.
- **Confirmations** name subject kind, group and cluster: "Revoke access of group `sre-emea` to `prod-eu-1`? Members lose access within a minute."

## 6. Out of scope (CP4.5)

FleetConsole-local groups; nested groups; OIDC/LDAP group sync; editing host `Group` membership from FleetConsole;
per-namespace grants; ServiceAccount subjects; most-permissive merging; caching of discovery/OpenAPI (CP6, may reuse
the cache with fail-safe on); ReadyToRun publish (T-0242 follow-up, backlog); modelling watch/exec streams in the load test.

## 7. Open questions (with recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Ship a Groups page in CP4.5a, or only the subject kind on the cluster Access tab? | **Ship it** (GPG): "one team → many clusters" is the point of the checkpoint; it reuses the bulk wizard and user tab. |
| Q2 | Effective access as a new user tab or merged into "Cluster access"? | **New tab** — "Cluster access" stays the list of direct grants you edit; Effective access is read-only explanation. |
| Q3 | Priority range and default? | **1–1000, no default** for groups (admin must choose; forces thinking about overlaps). |
| Q4 | Does the RO flag on a user also apply to group-derived admin roles (`Auth:AdminGroups`)? | **Out of scope** — admin roles are unchanged; RO flag here is about cluster access only. |
| Q5 | Revalidation group refresh — which host call? | `GET user.openshift.io/v1/users/~` with the user's token (same as login); if it fails, keep the last groups and log, as today's revalidation. |
| Q6 | TTL backstop value? | **30 s** default (below the 60 s revalidation interval), configurable. |
| Q7 | Show groups' members count when the host SA can't `get` groups? | Show `-` with a tooltip; don't fail the page. |
