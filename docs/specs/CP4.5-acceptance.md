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
| UIG-1/2/3 (live) | same spec, step 1: Access tab › Grant access › Group radio (User is the default) › Subject name `Use "e2e-team"` › Priority 100 with its helper text › toast "Granted group e2e-team ReadOnly on …" | met |
| QG-1 | `scripts/check-fe.sh` green on the branch after all FE tasks (see T-0266 Work log) | met |

Full e2e suite: 37/38 in each of the last two runs. The one failure is `workloads.e2e.ts` QGC-1/OAPI-3, a pre-existing
completion-step flake (CP4c test, not CP4.5 scope) filed as **T-0271** (not blocking).
Test-only fixes: the SRCH-1/2 option regex was stale since T-0237 (the sr-only kind makes the option "Pod Pod").
`findInEditor` now focuses Monaco instead of clicking under the sticky header, which fixed a POL-2 flake.
