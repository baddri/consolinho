# CP1 — Identity & administration: QA report

**Date:** 2026-11-20 · **Branch:** `cp/1-identity-admin` @ `1271208` (plus the uncommitted QA tests listed below) ·
> **Update 2026-11-20:** the human ran browser checks H1–H4 against `aspire run` — **all pass**. Final tally: 70/70 pass.

**Spec:** `docs/specs/CP1-identity-and-admin.md` §4 · **Verdict:** 70 criteria: **66 pass**, **4 needs-human** (browser
confirmation only; automated and server-side evidence exists), 0 partial, 0 fail. **No defects filed.**

## Checks run

| Command | Result |
|---|---|
| `scripts/check-be.sh` (podman env vars set), before QA | build ok (`-warnaserror`); Domain 323, Application 402, Api 604: all pass |
| `scripts/check-be.sh`, after QA tests | build ok; Domain 323, Application 402, Api 612 (604 + 8 QA): all pass |
| `scripts/check-fe.sh`, before and after | lint/typecheck ok; 46 files, 504 tests pass; build ok (no FE files changed by QA) |
| `aspire start --launch-profile http && aspire wait web`, probes, `aspire stop` | api, consoledb, devoauth, postgres, web Running/Healthy; stopped cleanly (Api/DevOAuth processes exit a few seconds after `aspire stop`); no leftover processes or containers |
| `API_URL=http://localhost:5180 npm run gen:api` against the live Api | `schema.gen.ts` regenerated with **zero diff** (QG-4) |
| Live curl, real OAuth flow through DevOAuth :5190 (`bob`, `alice`, `admin`), deep link `returnUrl=/c/demo-t0043-081142/projects?q=1` | all three end on `302` to that deep link (AUTH-1/2). `/api/clusters`: bob `[]`, alice `[demo-t0043-081142, accessMode readOnly]`, admin `[]` (admin via config `group fleetconsole-admins`, GRANT-6). alice `GET /api/admin/users` 403; bob `POST /api/admin/users` 403 `Auth.Forbidden` ProblemDetails. Logout without CSRF 403, with CSRF 204, then `/me` 401. SPA deep link and `/login?loggedOut=1` serve `index.html`. `aspire logs api` (221 lines): no `sha256~`, `access_token` or `Bearer <value>` |

## Traceability

Test names are xUnit methods in `tests/FleetConsole.*.Tests` or Vitest titles in `web/src/**`. "QA" marks tests added in
this verification.

### AUTH — authentication & session

| AC | Evidence | Verdict |
|---|---|---|
| AUTH-1 Login flow | `AuthEndpointsTests.Login_RedirectsToTheHostAuthorizeEndpoint_WithPkceAndTheConfiguredRedirectUri`, `FullFlow_LandsOnTheReturnUrl_WithASession`, `Login_WhenAlreadySignedIn_GoesStraightToTheReturnUrl`; FE `LoginPage.test` (one button → Api login endpoint), `session.test` (unauthenticated route → login with return URL). Live curl flow above. | **pass** |
| AUTH-2 Return URL safety | `AuthEndpointsTests.MaliciousReturnUrls_EndOnTheStartPage`, `ReturnUrlPolicyTests` (`EverythingElse_BecomesRoot`, `OverlongValues_BecomeRoot`); FE `returnUrl.test` (21 malicious values incl. `//evil`, `/\evil`, `\\evil`, `/%5Cevil`, `/%2F%2Fevil`, `javascript:`), `LoginPage.test` "keeps a safe return URL and drops an unsafe one". Live: deep link survives the real flow (server side). Browser round trip not observed. | **needs-human** (H1) |
| AUTH-3 Token discarded | `AuthEndpointsTests.AccessToken_IsInNoCookieNoTableAndNoLogLine` (decrypted cookie, full DB dump, captured logs); `TokenExchangeFailureTests.OAuthErrorRedirect_WithRemoteText_EndsOnLogin_WithoutLoggingTheText`. Live log scan clean. | **pass** |
| AUTH-4 Cookie | `SessionCookie_HasAdr0009Attributes_SecureOverHttps_ExpiresAfterTheSessionLifetime`, `SessionCookie_OverPlainHttpInDevelopment_IsNotSecure`, `AuthenticationSetupTests` (default 8 h, invalid lifetimes rejected), `SessionRevalidationTests.EachRevalidation_RenewsTheCookie` (sliding) | **pass** |
| AUTH-5 Auto-provisioning on | `AuthEndpointsTests.ProvisionedUser_IsAuditedAndRecorded`; `CompleteLoginHandlerTests` | **pass** |
| AUTH-6 Auto-provisioning off | `LoginOutcomeTests.AutoProvisioningOff_UnknownUser_IsNotRegistered_PreCreatedUserLogsIn`; FE `LoginPage.test` (exact message, username rendered as text, not markup) | **pass** |
| AUTH-7 Deactivated user | `AuthEndpointsTests.DeactivatedUser_IsRefused_WithoutSession_AndAudited`; FE `LoginPage.test` message | **pass** |
| AUTH-8 Bootstrap admins | `AdminGroupMember_BecomesAdminByConfiguration_AuditedAsSystemConfig` (integration, group); `CompleteLoginHandlerTests` + `AdminConfigurationResolverTests` (username list); `UsersAdminEndpointsTests.Detail_OfConfigurationAdmin_ShowsSourceAndGroups`. Live: `admin` → `isAdminViaConfiguration: true`. | **pass** |
| AUTH-9 `GET /api/auth/me` | `Me_WithoutSession_Returns401ProblemDetails_WithoutRedirect`, `Me_ForAUserWithoutFullNameOrGroups_…`, `OpenApiDocumentTests.CurrentUser_IsTheTyped200SchemaOfMe`; FE `UserMenu.test` (name, Admin and Read only badges). Live `/me` for 3 users. | **pass** |
| AUTH-10 Logout | `Logout_ClearsTheSession_Returns204_AndIsAudited`, `Logout_WithoutCsrfHeader_Returns403_AndKeepsTheSession`, `Logout_WithoutSession_Returns204`; FE `UserMenu.test` "posts the logout with the CSRF header and lands on the logged-out login page" (`?loggedOut=1`, message, login link). Live curl 403/204/401. Browser page not observed. | **needs-human** (H2) |
| AUTH-11 Session revalidation | `SessionRevalidationTests` (5: deactivate → 401 + cookie cleared, role/read-only reflected without re-login, reactivate doesn't revive, default interval); `SessionValidatorTests` (9); FE `session.test` "ends the session on a later 401 … session-ended message" | **pass** |
| AUTH-12 Expired session in SPA | FE `session.test` (401 → `/login` with return URL incl. hash, loop guard on login page, single redirect for parallel failures) | **pass** |
| AUTH-13 CSRF | `CsrfHeaderTests` (POST/PUT/PATCH/DELETE without, wrong, repeated header; malformed body is 403 not 400; anonymous endpoints; safe methods and non-API paths unaffected). **QA** `AdminAuthorizationMatrixTests.EveryMutatingAdminRoute_WithoutCsrfHeader_Is403BeforeTheEndpoint` (all 19 mutating admin routes). FE `client.test` (header on mutating verbs). | **pass** |
| AUTH-14 Host OAuth unavailable | `UsersEndpointFailure_EndsOnLoginWithUnavailable_AndIsLoggedWithTraceId`, `Cancel_OnTheOpenShiftLoginPage_EndsOnLoginWithCancelled`, `LoginOutcomeTests.UnreachableHost_…`, `HostBackAfterAnOutage_…`, `TokenExchangeFailureTests` (8: 503/429/invalid_grant/non-JSON/unreachable, no remote text logged); FE `LoginPage.test` messages | **pass** |
| AUTH-15 Dev emulator | `DevOAuth*Tests` (discovery, authorize picker, token, `users/~`, configuration with admin/alice/bob/ines); `TestOAuthServer` is `WebApplicationFactory<DevOAuthEntryPoint>` (in-process); `ProjectFileArchitectureTests` (Api does not reference DevOAuth). Live: AppHost runs `devoauth` on :5190. | **pass** |

### ADM — authorization & admin shell

| AC | Evidence | Verdict |
|---|---|---|
| ADM-1 Admin only | Per feature: `*.NonAdmin_Is403*`, `*.Anonymous_Is401` (users, clusters, credentials, grants, audit). `AnonymousSurfaceTests.AdminEndpoints_RequireTheAdminPolicy`. **QA** `AdminAuthorizationMatrixTests.EveryAdminRoute_Anonymous_Is401ProblemDetails` and `EveryAdminRoute_NonAdmin_Is403Forbidden`: every one of the 28 mapped `/api/admin/*` method+route pairs, enumerated from the routing data source. `AuthorizationBehaviorTests` (pipeline). | **pass** |
| ADM-2 Read-only admin | Per feature `*ReadOnlyAdmin*` tests; `UsersAdminEndpointsTests.ReadOnlyAdmin_InvalidBody_IsReadOnly_NotValidation`; `ReadOnlyGuardBehaviorTests`. **QA** `EveryMutatingAdminRoute_ReadOnlyAdmin_Is403ReadOnly` (all 19 commands, `Auth.ReadOnly`), `EveryAdminQuery_ReadOnlyAdmin_IsNotForbidden` (all 9 queries). FE: "ADM-2" tests on every admin page/dialog (aria-disabled with reason, nothing sent). Note: a body that fails *model binding* (e.g. `{}` on cluster register/update) gets a framework 400 first, as contract §7 allows: **QA** `EmptyClusterBody_ReadOnlyAdmin_IsAFramework400ProblemDetails` pins it as ProblemDetails. | **pass** (see R1) |
| ADM-3 Admin nav/pages for admins only | FE `admin.test` (sidebar hidden for non-admin, no-access page incl. unknown admin paths, read-only admin allowed) | **pass** |
| ADM-4 Optimistic concurrency | BE: `StaleVersion_Is409ConcurrencyConflict_OnEveryTransition` (users), `Update_StaleVersion_Returns409`, `Transition_StaleVersion_Returns409` (clusters), `Rotate_StaleVersion_Is409…` (credentials), grants update with version; `ConstraintAndConcurrencyTests`. FE: "ADM-4" tests in `UserActions`, `ClusterForm` (keeps typed values), `ClusterCredentialsTab` (keeps typed token), `GrantsTab` (recovers from conflict) | **pass** |
| ADM-5 Last-admin protection | `LastAdminTests` (3), `DemoteOrDeactivateSelf_Is409SelfChange`, Domain `UserTests`; FE `UserActions.test` "ADM-5". Accepted gap: ADR-0009 concurrent cross-demotion. | **pass** |

### USR — users

| AC | Evidence | Verdict |
|---|---|---|
| USR-1 List | `List_IsSortedOrdinally_WithStatusGrantCountAndVersion`; FE `UsersListPage.test` (11: columns, tooltips, text/chip filters in URL, sort by last login, loading, error+Retry) | **pass** |
| USR-2 Pre-create | `Create_Is201WithLocation_AuditedOnce_AndATakenNameIs409`, `Create_Defaults_ToWritableUser`, `Create_InvalidUsername_Is400OnUsernameField`, `UsernameTests`; FE `UserActions.test` "USR-2", `BulkGrantWizard.test` "USR-2" (grant-now step) | **pass** |
| USR-3 Promote/demote | `PromoteThenDemote_ReturnsFreshVersion_AndAuditsEachChangeOnce`; FE `UserActions.test` "USR-3" | **pass** |
| USR-4 Deactivate/reactivate | `DeactivateThenReactivate_KeepsGrants_AuditedOncePerChange`, `LastAdminTests.Deactivate_EndsTheUsersSession_AndKeepsGrants`; FE "USR-4" (names user and cluster count) | **pass** |
| USR-5 Global read-only | `SetReadOnly_TogglesFlag_AuditedOncePerChange`; FE `UserActions` "USR-5", `UserDetailPage` (explanation text) | **pass** |
| USR-6 Config-sourced admin | `DemoteConfigurationAdmin_Is409AdminViaConfiguration`, `PromoteConfigurationAdmin_RecordsAssignment_OnceWithSource`; FE `UserDetailPage` "USR-6", `UserActions` "USR-3/ADR-0017/USR-6" | **pass** |
| USR-7 Detail page | `Detail_OfConfigurationAdmin_…`, `Detail_Unknown_Is404`; FE `UserDetailPage.test` (tabs, actions, not-found, error), `GrantsTab.test` (Cluster access tab), `AuditLogPage` deep link `?user=` | **pass** |
| USR-8 No hard delete | Route enumeration (QA matrix): no `DELETE /api/admin/users/*` exists | **pass** |

### CLU — clusters

| AC | Evidence | Verdict |
|---|---|---|
| CLU-1 Register | `RegisterClusterTests` (10: 201+Location+audit, defaults, 409 taken, field 400s, missing env), `ClusterNameTests`, `ApiServerEndpointTests`, `ClusterValidatorTests`; FE `ClusterForm.test` "CLU-1" | **pass** |
| CLU-2 CA bundle | `CaBundleTests`, `Register_CaBundleWithPrivateKey_Returns400OnCaBundle`, `Detail_ReturnsCaCertificates_WithExpiryStatus`, `Detail_WithoutCaBundle_…`; FE `ClusterDetailPage` "CLU-2", `ClusterForm` "CLU-2" | **pass** |
| CLU-3 Skip TLS flagged | `Register_SkipTlsVerify_HasSkipVerifyMode`, `Register_SkipTlsVerifyWithCaBundle_Returns400OnSkipTlsVerify`; FE `ClusterForm` "CLU-3" (warning, conflict, production confirmation), `ClusterDetailPage` "CLU-3" | **pass** |
| CLU-4 Edit | `UpdateClusterTests` (9), `Update_OnlyConnectionChanges_MarkLastTestStale`; FE `ClusterForm` "CLU-4" | **pass** |
| CLU-5 Enable/disable | `DisableThenEnable_KeepsCredentialsAndGrants_AndAudits`, `ClustersEndpointsTests.Lists_Enabled_Granted_Clusters_…`; FE `ClusterActions` / `ClusterDetailPage` "CLU-5" | **pass** |
| CLU-6 Delete | `Delete_EnabledCluster_Returns409NotDisabled`, `Delete_DisabledCluster_RemovesCredentialsAndGrants_AndAuditsCounts`; FE `ClusterActions` "CLU-6" (type-to-confirm, counts, 409) | **pass** |
| CLU-7 List | `ClusterQueriesTests` (roll-ups, worst expiry); FE `ClustersListPage.test` (columns, filters in URL, 40+ clusters, empty/loading/error) | **pass** |
| CLU-8 Detail page | FE `ClusterDetailPage.test` (13: tabs URL-driven, Actions, env label, not-found, error); `GrantsTab` "CLU-8" | **pass** |

### CRED — credentials

| AC | Evidence | Verdict |
|---|---|---|
| CRED-1 Add | `CredentialsEndpointsTests.Add_*` (trim, invalid → 400 without echo, 16384-char limit, 409 name taken), `CredentialValidatorTests`; FE `ClusterCredentialsTab` "CRED-1" | **pass** |
| CRED-2 Write-only | `Cred2_TokensNeverLeave_AfterAddAndRotate`, `Grant_Responses_Never_Contain_The_Token`, `AuditResponses_NeverContainTokens`, connection-test success paths, `TokenProtectionTests` (ciphertext in DB). **QA** `TokenLeakSweepTests.NoToken_InAnyResponse_AuditEntry_DatabaseRow_OrLogLine`: add → rotate → grant → stored test → `test-token` (valid and invalid) against a **hostile** fake API server that echoes the bearer token in its 500/403 bodies; scans every command response plus `GET /api/admin/clusters`, `/clusters/{name}`, `/clusters/{name}/credentials`, `/credentials`, `/clusters/{name}/grants`, `/users/{u}/grants`, `/users/{u}`, `/users`, `/audit?cluster=`, the user's `/api/clusters`, the `credential.tested` and `credential.token_tested` audit details and summaries, the full DB dump and the captured logs, for all three tokens. Passes. | **pass** |
| CRED-3 Metadata | `Add_Jwt_Returns201_WithMetadataAndLocation`, `Add_OpaqueToken_IsAccepted_WithUnknownExpiry`, `TokenInspectorTests`, `TokenFingerprintsTests` | **pass** |
| CRED-4 Expiry status | `CredentialExpiryTests.ExpiryStatus_FollowsTheClockAndTheWarningWindow`; FE `ClusterCredentialsTab` "CRED-4" | **pass** |
| CRED-5 Rotate | `Rotate_KeepsIdAndGrants_AndAuditsOldToNewFingerprint`; FE `ClusterCredentialsTab` "CRED-5/2", `TestConnection` "CRED-5" (test new token, Save anyway) | **pass** |
| CRED-6 Delete | `Delete_Unused_Is204_Used_Is409_InUse`; FE `ClusterCredentialsTab` "CRED-6" (lists users; race) | **pass** |
| CRED-7 Fleet page | `FleetList_IsSortedByExpiryAscending_NullsLast`; FE `CredentialsListPage.test` (sort, filters, empty/loading/error) | **pass** |
| CRED-8 Expiry warnings | FE `CredentialsListPage.test` (counts + filtered link on Credentials and Clusters pages, warning vs danger, absent when fine); `List_ExpiredCredential_IsWorst` | **pass** |

### GRANT — grants

| AC | Evidence | Verdict |
|---|---|---|
| GRANT-1 Model | `Create_Second_Grant_Is409_AlreadyExists`, `Create_With_Credential_Of_Another_Cluster_Is400_On_CredentialId`, Domain `GrantTests`; FE `GrantsTab` "GRANT-1" | **pass** |
| GRANT-2 Create (single) | `Create_Returns201_WithGrant_AndAudits`, `Create_Defaults_To_ReadOnly`; FE `GrantsTab` "GRANT-2" (both entry points, pre-selected credential, production RW warning) | **pass** |
| GRANT-3 Change/revoke | `Update_Changes_Mode_And_Credential_And_Audits_OldToNew`, `Revoke_Returns204_Audits_And_Then404`; FE `GrantsTab` "GRANT-3" | **pass** |
| GRANT-4 Bulk | `Bulk_Creates_All_Grants_In_Request_Order_With_One_Audit_Entry_Each`, `Bulk_With_Bad_Items_Is400_Listing_Every_Item_And_Writes_Nothing`, `Bulk_Rejects_Duplicates_…`; FE `BulkGrantWizard.test` (already-has-access disabled, submit disabled without credential, preferred name, production highlight + warning, per-row 400), `pickCredential.test` | **pass** |
| GRANT-5 Grants and state | `Lists_Keep_And_Mark_Disabled_Clusters_Deactivated_Users_And_Expired_Credentials`; FE `GrantsTab` "GRANT-5" | **pass** |
| GRANT-6 Admin ≠ access | `ClustersEndpointsTests.Admin_Without_Grants_Gets_Empty_List`; FE `GrantsTab` "GRANT-6"; live: `admin` gets `[]` | **pass** |

### TEST — test connection

| AC | Evidence | Verdict |
|---|---|---|
| TEST-1 Run | `ConnectionTestEndpointsTests` (stored and ad-hoc, `TestCredential_OnDisabledCluster_Runs`, `ReadOnlyAdmin_IsForbidden`), `ConnectionTesterTests.Timeout_fails_the_running_step_and_skips_the_rest` (overall budget, `ConnectionTestTimeout` default 15 s); FE `TestConnection.test` "TEST-1" | **pass** |
| TEST-2 Steps | Step order asserted in `TestCredential_WithCaBundle_Succeeds_…`; failure kinds in `ClusterProbeClientTests` (DNS, refused, timeout, TLS unknown authority/hostname mismatch/expired) and `ConnectionTesterTests` (401, SelfSubjectReview fallback to `sub`, ClusterVersion forbidden is a warning) | **pass** |
| TEST-3 Capability summary | `ConnectionTesterTests.Headline_*` (4 levels), `Namespace_rules_only_when_requested`, `Rules_review_failure_is_a_capabilities_warning`; FE `TestConnection` "TEST-3", `ConnectionTestResultView.test` | **pass** |
| TEST-4 Hints | `Hint_when_read_write_grants_but_no_write_access`, `Hint_when_cluster_admin_with_read_only_grants`, `TestToken_WithCredentialHavingReadWriteGrants_HintsThatItCannotWrite` | **pass** |
| TEST-5 Recording | `TestCredential_WithCaBundle_…_Stored_Audited…` (`credential.tested` details = succeeded/headline), `TestToken_StoresNothingButTheAuditEntry_WithFingerprint` (`credential.token_tested` details = succeeded/headline/fingerprint); **QA** sweep confirms neither audit entry nor the stored last test carries a token or the hostile upstream body | **pass** |

### AUD — audit log

| AC | Evidence | Verdict |
|---|---|---|
| AUD-1 Coverage | `AuditCoverageTests`, `*AuditHandlerTests` (user/cluster/credential/grant), `AuditAtomicityTests` (rolled-back change writes no entry), integration "Audits…Once" tests per command; auth events in `AuthEndpointsTests` (login, login_denied, logout) | **pass** |
| AUD-2 Entry shape | `Entry_ExposesAllFields_AndCorrelationIdIsTheWritingRequestsTraceId`, `AuditResponses_NeverContainTokens`, `Update_CaBundle_AuditsFieldNameButNeverCaContent`; FE `AuditLogPage` "AUD-2" | **pass** |
| AUD-3 Append-only | Route enumeration (QA matrix): only `GET /api/admin/audit` exists under `/audit` | **pass** |
| AUD-4 Viewer | `Pages_AreNewestFirst_WithoutDuplicatesOrGaps_WhileNewEntriesArrive`, `Filters_Alone_And_Combined`, time-range tests, `DefaultLimit = 50`; FE `AuditLogPage.test` (13: filters in URL, presets/custom, deep links, loading/error/no-match) | **pass** |
| AUD-5 Read-only admins view | `AuditEndpointsTests.ReadOnlyAdmin_Is200`; FE "AUD-5" | **pass** |

### SW — cluster switcher & landing

| AC | Evidence | Verdict |
|---|---|---|
| SW-1 `GET /api/clusters` | `ClustersEndpointsTests` (6: enabled+granted, order, only switcher fields, global read-only effective mode, deactivated, 401). Live: alice/bob/admin. | **pass** |
| SW-2 Switcher | FE `clusterContext.test` (contract order, env and Read only labels, global read-only, skeleton, "Clusters unavailable" + retry). Live: alice's only cluster is `accessMode: readOnly`. Browser rendering not observed. | **needs-human** (H3) |
| SW-3 Landing | FE `clusterContext.test` "goes to the remembered cluster…", "ignores a stale remembered cluster…", "remembers the granted cluster…" | **pass** |
| SW-4 No grants | FE `clusterContext.test` (user, admin, read-only admin variants of "No clusters assigned yet"; switcher "No clusters" disabled). Live: bob `[]`. Browser rendering not observed. | **needs-human** (H4) |
| SW-5 Not granted / unknown | FE `clusterContext.test` "Cluster `<name>` is not available" (same message for unknown and ungranted) | **pass** |
| SW-6 Live-ish | FE `clusterContext.test` "refetches on window focus and every 5 minutes"; `GrantsTab` "GRANT-6" (switcher updates without reload) | **pass** |

### QG — quality gates

| AC | Evidence | Verdict |
|---|---|---|
| QG-1 BE tests | Domain invariants: `GrantTests`, `CredentialTests`, `UserTests` (last admin), `ClusterTests`/`ClusterNameTests` (name immutability). Integration per admin endpoint: happy path + 400/403/404/409 in `Integration/Admin/**` on Testcontainers Postgres + in-process DevOAuth; QA matrix adds 401/403/CSRF for every route. | **pass** |
| QG-2 Fake API server | `FakeKubeApiServer` with real TLS (`TestCertificateAuthority`): canned `/version`, 401, unknown-authority, SSAR/SSRR; `ConnectionTestEndpointsTests`, `ClusterProbeClientTests` | **pass** |
| QG-3 FE MSW tests | loading/empty/error per admin page (`UsersListPage`, `UserDetailPage`, `ClustersListPage`, `ClusterDetailPage`, `CredentialsListPage`, `ClusterCredentialsTab`, `GrantsTab`, `AuditLogPage`, `ClusterForm`), bulk-grant flow, read-only admin disabled state (every page), no-grants empty state, 401 → login (`session.test`) | **pass** |
| QG-4 Generated types | `schema.test.ts` (types pinned to `schema.gen.ts`); live `gen:api` zero diff (above) | **pass** |

## Tests added by QA (uncommitted)
- `tests/FleetConsole.Api.Tests/Integration/Admin/AdminAuthorizationMatrixTests.cs` (7): enumerates every `/api/admin/*`
  route from `EndpointDataSource` and checks anonymous → 401 `Auth.Unauthenticated`, non-admin → 403 `Auth.Forbidden`,
  read-only admin on every command → 403 `Auth.ReadOnly`, read-only admin on every query → not 401/403, admin without the
  CSRF header on every command → 403 `Auth.CsrfHeaderMissing`. Route parameters don't exist, so a check placed after the
  lookup would show as 404. It also pins the contract-allowed binding-400 exception and guards against an empty sweep.
- `tests/FleetConsole.Api.Tests/Integration/Admin/TokenLeakSweepTests.cs` (1): the end-to-end CRED-2 / TEST-5 sweep
  with a hostile upstream described under CRED-2.

## Defects

None filed. No behaviour contradicted the spec, the API contract or an accepted deviation.

## Needs-human steps (browser)

Setup: `export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ASPIRE_CONTAINER_RUNTIME=podman`,
then `aspire run` (or `aspire start --launch-profile http && aspire wait web`). Open the `web` URL from the dashboard
(e.g. `http://localhost:<web-port>`). The DevOAuth picker (:5190) lists `admin`, `alice`, `bob`, `ines`. The dev DB has
cluster `demo-t0043-081142` with an alice ReadOnly grant. Use a private window per user.

- **H1 (AUTH-2):** logged out, open `/c/demo-t0043-081142/projects?q=1` → `/login` → "Log in with OpenShift" → pick
  `alice` → you land on `/c/demo-t0043-081142/projects?q=1`. Then open `/login?returnUrl=https%3A%2F%2Fexample.com`
  and log in → you land on `/`, not example.com.
- **H2 (AUTH-10):** logged in, user menu → "Log out" → `/login?loggedOut=1` shows "You have been logged out." and the
  login button. Wait ~5 s: **no** automatic redirect to the OAuth picker. Reload the page: still on the login page.
- **H3 (SW-2):** as `alice`, open the masthead cluster switcher → `demo-t0043-081142` with the "Development" label and
  a "Read only" label.
- **H4 (SW-4):** as `bob`, open `/` → EmptyState "No clusters assigned yet", body "You are logged in as `bob` …", no
  admin links; the switcher shows "No clusters" and is disabled. As `admin` (no grants), the same page also offers
  "Go to Administration" and the grant-yourself hint.

## Risks / notes (not CP1 defects)
- **R1:** A request body that fails model binding (e.g. `{}` or missing `environment` on cluster register/update) gets a
  framework 400 before the read-only/field checks. That 400 has no `code` and no field `errors` (T-0043 deviation
  list). The contract §7 allows this. The UI always sends complete bodies, so there is no user impact. A
  hand-crafted request gets a less helpful error.
- **R2:** ADR-0009 "Known gap, accepted": two admins demoting each other at the same moment can leave zero writable
  admins. Recovery is through `Auth:BootstrapAdminUsers`/`Auth:AdminGroups`.
- **R3:** No browser e2e yet (Playwright is planned for later checkpoints). H1–H4 rely on MSW component tests plus the
  server-side curl evidence above. Recommend a Playwright smoke test for login → deep link → logout when e2e lands.
- **R4:** The token-leak and authz sweeps are only as complete as their lists. The authz matrix enumerates routes
  automatically, but the leak sweep's GET list is hand-maintained. Extend it when CP2 adds proxy routes. The proxy
  must also be checked for `Authorization` header stripping and for the SA token never reaching the browser.
- **R5:** `aspire stop` returns before the Api/DevOAuth processes exit (gone within ~10 s). The Aspire CLI suggests
  17.0.0; stay on 13.x per the stack table.
- **R6:** The dev DB persists across runs (demo data from T-0043 and this QA run: logins of bob/alice/admin and their
  audit entries). That is harmless, but don't let demos assume an empty database.
