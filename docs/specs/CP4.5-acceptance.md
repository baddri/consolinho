# CP4.5 acceptance

## CP4.5a backend (QA, T-0259, 2026-11-24, branch `cp/4.5-access-at-scale`)

Black-box evidence goes through the HTTP surface (`LoginAsAsync`, proxy stub with one fake token per credential).
New tests live in `tests/FleetConsole.Api.Tests/Integration/Security/GroupAccessSecurityTests.cs` (GAS below).
Status: **met (BE)** means the backend part is proven. **FE: T-0xxx** means the UI half is tracked in that task.

| ID | Evidence (test names) | Status |
|---|---|---|
| GRP-1 | GrantSubjectPersistenceTests `Migration_UpMarksExistingGrantsAsUser…`, `GroupGrant_RoundTrips…`, `CheckConstraint…`; GrantTests `UserGrant_HasUserShape` | met |
| GRP-2 | GroupGrantsEndpointsTests `Create_With_Missing_Or_OutOfRange_Priority_Is400_On_Priority`, `Update_User_Grant_With_Priority_Is400_On_Priority`; GrantTests `CreateForGroup_AcceptsPriorityBounds` | met |
| GRP-3 | GAS `QG3a_System_groups_are_refused_on_create_and_bulk_and_never_stored`, `QG3a_System_groups_reported_by_the_host_are_not_recorded_listed_or_effective`, `QG3a_A_stored_system_group_grant_plus_membership_fails_closed`; GroupNameTests `Create_RefusesSystemGroupsFirst_AnyCase`; AccessResolverTests | met (see R1, R2) |
| GRP-4 | GroupGrantsEndpointsTests `Create_With_Taken_Priority_Or_Existing_Group_Grant_Is409`; GrantTests `CreateForGroup_RefusesTakenPriority_NamingTheOtherGroup` | met |
| GRP-5 | GroupGrantsEndpointsTests `Create_With_Taken_Priority_Or_Existing_Group_Grant_Is409` (`Grants.AlreadyExists`) | met |
| GRP-6 | GroupNameTests `Create_AcceptsAndTrims`, `Create_RefusesInvalidNames`, `Create_AcceptsMaxLength`/`OverMaxLength`; GroupGrantsEndpointsTests `Create_With_Invalid_Group_Is400_On_GroupName` | met |
| GRP-7 | GrantAuditHandlerTests `GroupGrantCreated_RecordsKindGroupAndPriority`, `GroupGrantChanged…`, `GroupGrantRevoked…` | met |
| PREC-1 | GAS `QG3b_Removed_from_host_group_loses_the_proxy_and_the_switcher_after_revalidation_only`, `QG3b_Host_unreachable_signs_out_a_group_member_and_keeps_a_direct_only_user_on_the_proxy`; SessionRevalidationTests `RemovedFromHostGroup…`, `HostUnreachable…`; SyncUserGroupsHandlerTests | met (see R3) |
| PREC-2 | ProxyGroupGrantTests `Auto_provisioned_group_member_sees_the_cluster_and_proxies_with_the_group_credential` | met |
| PREC-3 | GAS `PREC3_4_The_winning_grants_credential_token_is_the_one_that_reaches_the_cluster`; ProxyGroupGrantTests `Direct_read_only_grant_beats…`; AuthorizeProxyRequestHandlerTests | met |
| PREC-4 | GAS `PREC3_4_…`; ProxyGroupGrantTests `Highest_priority_group_grant_supplies…` | met |
| PREC-5 | AccessResolverTests `Resolve_AppliesPrecedenceRules`; AuthorizeProxyRequestHandlerTests `Tied_group_grants_resolve_to_read_only_and_log_a_warning_with_ids_only`; GetEffectiveAccessHandlerTests `Top_priority_tie…`, `Tie_with_the_same_mode_is_broken_by_grant_id` | met |
| PREC-6 | GAS `QG3c_Read_only_user_in_a_read_write_group_is_refused_mutations_before_forwarding`; ProxyGroupGrantTests `Read_only_user_is_narrowed…`; GetEffectiveAccessHandlerTests `Stored_read_only_flag_narrows_a_read_write_winner` | met |
| PREC-7 | GAS `PREC7_Credential_rotation_removal_guard_and_deactivation_apply_to_group_grants_as_to_user_grants`; ProxyGroupGrantTests `Group_grant_on_a_disabled_cluster…`, `Deactivated_group_member_is_not_available` | met |
| PREC-8 | ProxyGroupGrantTests `Proxy_authorization_is_one_sql_statement_matching_groups_with_any`; GAS `EFF3_…`; AccessResolverTests | met |
| GPG-1 | GroupsAdminEndpointsTests `HostOk_ListsHostAndGrantOnlyGroups…`; GroupQueryHandlerTests `List_Unions…` | met (BE); FE: T-0263 |
| GPG-2 | GroupsAdminEndpointsTests (detail); GroupQueryHandlerTests `Get_ListsMembersOrdinal_MarkingRegisteredUsers` | met (BE); FE: T-0263 |
| GPG-3 | GroupGrantsEndpointsTests `Bulk_Creates_All_Or_Reports_Every_Failing_Item_And_Writes_Nothing` | met (BE); FE wizard: T-0264 |
| GPG-4 | GroupsAdminEndpointsTests `HostForbiddenThenDown_Is200_WithUnknownHostFacts_AndGrantOnlyGroups` | met (BE); FE empty state: T-0263 |
| EFF-1 | EffectiveAccessEndpointsTests `Matches_the_users_switcher_and_explains_the_winner`; GetEffectiveAccessHandlerTests | met (BE); FE: T-0265 |
| EFF-2 | same (candidates, outcomes, `beatenBy`) | met (BE); FE copy: T-0265 |
| EFF-3 | GAS `EFF3_Effective_access_equals_the_switcher_for_every_user_of_a_mixed_fixture` (5 users × 4 clusters, user/group/narrowed winners, disabled cluster); EffectiveAccessEndpointsTests `Matches_the_users_switcher…` | met |
| EFF-4 | GetEffectiveAccessHandlerTests `Groups_as_of_is_null_before_login_then_last_login_then_the_later_check`; EffectiveAccessEndpointsTests `Never_logged_in_user_without_grants_has_no_clusters_and_no_groups_as_of` | met (BE); FE: T-0265 |
| EFF-5 | GetEffectiveAccessHandlerTests `No_access_and_deactivated_user_have_no_clusters`; EffectiveAccessEndpointsTests `Unknown_user_is_404_and_non_admin_is_403` | met (BE); FE: T-0265 |
| EFF-6 | OpenApiDocumentTests `EffectiveAccessSchemas_UseContractNames…`; FE type generation T-0241/T-0260 | met (BE) |
| Leak | GAS `Group_listings_grants_and_effective_access_never_contain_an_SA_token` (TokenLeakScanner over group/grant/effective-access responses and logs) | met |

Defects filed: none.

### Risks (not blocking)
- **R1** A grant row stored with a `system:` group name (only possible by direct SQL) makes the GroupName EF converter
  throw. Member requests then get 500, and admin listings that read the row also get 500. This fails closed and no
  token leaks (asserted in GAS `QG3a_A_stored…`). The T-0253 follow-up expected "NotAvailable". That result can't be
  reached over HTTP. The resolver rule is covered by AccessResolverTests.
- **R2** The virtual-group filter (`OpenShiftGroups.WithoutVirtualGroups`) matches `system:` ordinally. A mixed-case
  host group such as `System:Ops` is therefore recorded and shown in `/me` and in Effective access `groups`. The
  resolver and `GroupName` ignore it case-insensitively, so it grants no access. This is a cosmetic inconsistency only.
- **R3** The spec wording for PREC-1 says the proxy returns 403 after removal. The implementation follows the CP2
  contract instead: 404 `Proxy.NotAvailable` for a cluster the user can't access. The tests assert 404.
- The stale comment in `Infrastructure/Persistence/Configurations/UserConfiguration.cs` (T-0253 follow-up) is in
  production code. It is outside QA scope and is still open.

## CP4.5a frontend e2e (QA, T-0266, 2026-11-24, branch `cp/4.5-access-at-scale`)

Evidence comes from the real Api, the DevOAuth emulator and the fake Kubernetes API (`aspire start --launch-profile http`).
DevOAuth user `e2e-member` (group `e2e-team`) is reserved for this; global setup revokes its direct grants.

| ID | Evidence | Status |
|---|---|---|
| QG-2 | `web/e2e/groups.e2e.ts` `QG-2: a group grant gives read-only access…`: the member's switcher shows "read only"; Delete Pod is aria-disabled with the RO reason; Effective access reads "Group e2e-team (priority 100)", then "Direct grant", and the candidate reads "Overridden by direct grant". Green with `--repeat-each=2` (2/2) | met |
| UIG-1/2/3 (live) | same spec, step 1: Access tab › Grant access › Group radio (User is the default) › Subject name `Use "e2e-team"` › Priority 100 with its helper text › toast "Granted group e2e-team read only on …" | met |
| QG-1 | `scripts/check-fe.sh` green on the branch after all FE tasks (see T-0266 Work log) | met |

Full e2e suite: 37/38 in each of the last two runs. The one failure is `workloads.e2e.ts` QGC-1/OAPI-3, a pre-existing
completion-step flake (CP4c test, not CP4.5 scope) filed as **T-0271** (not blocking).
Test-only fixes: the SRCH-1/2 option regex was stale since T-0237 (the sr-only kind makes the option "Pod Pod").
`findInEditor` now focuses Monaco instead of clicking under the sticky header, which fixed a POL-2 flake.

## CP4.5a VERIFY (QA, 2026-11-24, branch `cp/4.5-access-at-scale` @ 7bf713a)

**Verdict: PASS.** No blocking defects.

**Gates (QG-1)**
- `check-be.sh`: build ok. The first run had 1 failure: `DevOAuthAuthorizeTests.GetAuthorize_RendersPicker_WithOneFormPerDevUser_AndCancel`
  expected 7 forms and got 8. Cause: 7bf713a added the DevOAuth user `e2e-member`, and nobody re-ran the BE gate after that.
  The test was stale and production behaves as intended, so the fix is test-only (expects `e2e-member`, 7 users + Cancel = 8).
  After the fix: DevOAuth 43/43; Domain 431, Application 776, Api 937 (the failing test now passes).
- `check-fe.sh`: lint, typecheck and build ok; 124 files, 1304/1304 tests. No load flakes appeared.

**AC coverage (CP4.5a).** Every CP4.5a ID has test evidence. Backend: the T-0259 table above. FE unit tests (Vitest + MSW):
- UIG-1/2/3/5: `GrantFormModal.test.tsx` (UIG-1/3, UIG-2/3, UIG-2 listing failure, UIG-5). UIG-4 and UIG-6:
  `GrantsTab.test.tsx` (UIG-4 columns, `?kind=group` filter, group revoke copy; UIG-6 RO admin), `GroupGrants.test.tsx` UIG-6.
- GPG-1/4: `GroupsListPage.test.tsx` (host + grant-only without system groups, forbidden host, empty state with hint).
  GPG-2: `GroupDetailPage.test.tsx` and `GroupGrants.test.tsx` GPG-2. GPG-3: `GroupGrants.test.tsx` (6 GPG-3 tests).
- EFF-1/2/3/4/5: `EffectiveAccessTab.test.tsx` (EFF-1/EFF-4 rows, 3 × EFF-2, EFF-3 equals switcher, EFF-5 empty and error).
- QG-2: e2e `groups.e2e.ts` (T-0266; not re-run here). QG-3: GAS tests (T-0259). QG-5: `ocp-parity.md` rows from T-0267;
  the gaps it found were fixed in T-0269/T-0270.
- CP4.5b items are out of scope here: CACHE-*, OPS-*, QG-4.

**Open risks (not blocking)**
- R1: a `system:` group grant row stored by direct SQL makes requests return 500. It fails closed and no token leaks.
- R2: the virtual-group filter is case-sensitive, so `System:Ops` is recorded and shown but grants no access. Cosmetic only.
- R3: PREC-1 returns 404 `Proxy.NotAvailable` (CP2 contract) where the spec says 403. The spec wording should follow the code.
- T-0271: the e2e QGC-1/OAPI-3 completion step flakes (CP4c scope). The full e2e run is 37/38.
- Process: e2e and fixture changes that touch `src/FleetConsole.DevOAuth` must re-run `check-be.sh` (this is how the stale test got through).

Defects filed: none (the one failure was a stale test, fixed in place).

## ACCEPT (CP4.5a) (product owner, 2026-11-24, @ 3da319f)
**Verdict: ACCEPTED.** All CP4.5a ACs are met per VERIFY. Gates are green. QG-2 e2e is green.
- R1 accepted. The row can only be created by direct SQL, which bypasses GRP-3 validation. The request fails closed (500, no token leaks). Backlog: tolerant read + log warning.
- R2 accepted for CP4.5a. GRP-3 ("any case") is met for access, but showing `System:Ops` in /me and Effective access misleads admins. Fix in **T-0272** (BE, 4.5b).
- R3: the 404 `Proxy.NotAvailable` is correct because it matches the CP2 no-access contract and hides whether the cluster exists. PREC-1 wording is aligned to 404.
- Toast copy: "ReadOnly"/"ReadWrite" exposes enum names. The rest of the UI says "Read only"/"Read write" (switcher, tables), and OCP toasts use plain language. Not a blocker, but it should change: **T-0273** (FE, 4.5b).
- T-0271 (QGC-1 completion flake, CP4c test) does not block. It is test-only, the feature passes in isolation and QA owns it. It must be fixed before the CP4.5b VERIFY so the e2e suite gives a clean signal.
- Process note from VERIFY is accepted: DevOAuth fixture changes must re-run `check-be.sh`.

## CP4.5b VERIFY (QA, T-0285, 2026-11-25, branch `cp/4.5-access-at-scale` @ 5d4895a + QA test changes)

**Verdict: PASS (CP4.5b build scope).** No blocking defects. OPS-2/OPS-3 deferred to T-0286 (live, post-deploy).

**Gates (QG-1)**: `check-be.sh` build ok, Domain 431, Application 840, Api 992 (incl. the 6 new QG-4 tests). `check-fe.sh` lint/typecheck/build ok, 124 files 1304/1304. `check-deploy.sh` ok. e2e (Aspire + Redis): 38/38 in 2 consecutive solo full runs (QGC-1/OAPI-3 green in both; `--repeat-each=5` on the T-0271 specs 5/5).

| AC | Evidence | Verdict |
|---|---|---|
| CACHE-1 | `CachingBehaviorTests` (7, step 5 after validation, hit skips pipeline, failures never cached); `AccessCacheTests.Second_request_is_served_from_the_cache_without_access_sql`. Deviation `IQueryCache` port vs `HybridCache` recorded in spec §4b/ADR-0040 | pass |
| CACHE-2 | `AccessSnapshotTests` (tags), `AccessCacheInvalidationTests` (every `IDomainEvent` handled or allow-listed; event→tag), `AccessCacheTests` (direct/group revoke, leave group, new group grant, rotation, disabled cluster → next request) | pass |
| CACHE-3 | NEW `AccessCacheReplicaTests`: two hosts, one DB + one Redis, 60 s TTL; direct revoke, group revoke, user read-only set on A → refused on B within 2 s. Negative control (B without Redis) fails all three | pass |
| CACHE-4 | `AccessCacheTtlTests` (lost invalidation heals at expiry); `ProductionConfigurationTests` rejects `Cache:Duration` outside 1 s–60 s | pass |
| CACHE-5 | NEW `AccessCacheFailureTests.Expired_entry_with_the_database_unreachable_answers_503…`: fresh entry serves with DB down, after expiry 3 × 503 `Persistence.Unavailable`, nothing forwarded; plus `QueryCacheTests.ExpiredEntry_WithFailingLoad_Throws…`, `PersistenceUnavailableTests` | pass |
| CACHE-6 | NEW `AccessCacheReplicaTests.Redis_never_holds_the_decrypted_SA_token`: SCAN all keys, GET/HGETALL every value after both replicas cached; no plaintext, JSON-escaped, percent-escaped or base64 (3 alignments) token, no OAuth access token; access key + user id + username seen | pass |
| CACHE-7 | NEW `AccessCacheFailureTests.Redis_down_keeps_login_and_proxy_working…` (Redis container stopped: L1 hit, new login + miss, revoke refused at once, `redis` Degraded, `/health` 200 "Degraded", Warning logged); `QueryCacheTests.RedisDown_*` (no password leak) | pass |
| CACHE-8 | `BACKEND.md` §Recipes › "Caching a query": key, tags, event→tag table (L225–245) | pass |
| OPS-1 | AppHost `AddRedis("redis")` (e2e ran on it); kustomize base `redis.yaml` (`--save ""`, `--appendonly no`, emptyDir, `--requirepass` from Secret `consolinho-redis`), `networkpolicy-redis.yaml` (ingress 6379 only from `component: server`); `check-deploy.sh` green | pass |
| OPS-2 | live, T-0286: revoke on pod A → pod B 404 `Proxy.NotAvailable` 1.35 s later (5/5); restore → 200 on both | pass |
| OPS-3 | live, T-0286: 35 950 req, 0 errors, p95/p99 72/107 ms (baseline 71/106); Postgres 8–14m (baseline peak 177m); server/pod −40% at 120 req/s | pass |
| QG-4 | CACHE-3/5/6 above, Testcontainers Redis; 18 cache tests green 3 consecutive runs | pass |

**Risks (not blocking)**
- R1: the backplane subscription is set up lazily on a pod's first cache use. An invalidation published in that window (ms) is missed and heals within `Cache:Duration` (30 s, CACHE-4). Tests handshake first; T-0286 should revoke only after both pods have served traffic.
- T-0271 (QGC-1/OAPI-3 flake) fixed test-side: the Monaco Find widget sometimes resumed at the 2nd `replicas: 1` (under `status`, caret line 34 vs 15, diagnosed by instrumenting the caret). `findInEditor` now steps to match "1 of N".

Defects filed: none.

## ACCEPT (CP4.5b) (product owner, 2026-11-25, @ 33841ce)
**Verdict: ACCEPTED (build scope).** CACHE-1 to CACHE-8, OPS-1, QG-1 and QG-4 are met per VERIFY. OPS-2/OPS-3 are open until T-0286; CP4.5 is not closed before then.
- CACHE-1 deviation accepted: a FusionCache `IQueryCache` port with tags taken from the loaded result is the hybrid cache the AC wants. Up-front `HybridCache` tags would need a second user lookup per event. Caching still runs in a pipeline behavior. AC wording is met in spirit (ADR-0040 §2).
- CACHE-6 goes further than the AC asked: Redis and L1 hold only ciphertext and the token is decrypted per request. This is accepted. Revisit only if OPS-3 shows decryption cost.
- R1 accepted. A fresh pod can miss an invalidation for a few ms before its backplane subscribes, and the 30 s `Cache:Duration` bounds it. This is the same exposure as the post-commit race in ADR-0040. Condition for T-0286: revoke only after both pods have served traffic, and record the refusal on the other pod.
- T-0286 must record OPS-3 next to the T-0242 baseline (p95 71 ms, Postgres peak 177m). HPA/requests change only if the data says so.
- Backlog (later): subscribe to the backplane eagerly at startup (readiness waits for it) to close R1 instead of relying on the TTL.
