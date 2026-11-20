# CP2 — Proxy, cluster switcher & resource browser: QA acceptance

**Date:** 2026-11-20 · **Branch:** `cp/2-proxy-browser` @ `7bc2841` (+ QA tests, uncommitted) · **Spec:**
`CP2-proxy-and-resource-browser.md` · **Contract:** `CP2-api-contract.md`

**Gates:** `check-be.sh` green (325 + 684 + 711 tests, 1 skipped = T-0093; one unrelated flaky DevOAuth test seen once → T-0094) · `check-fe.sh` green (lint, typecheck,
60 files, 693 tests, build) · e2e `npm run e2e` against `aspire start --launch-profile http`: 6/6 (H1–H4 + QG-4 browse ×2).

**Verdict: 55 criteria, 54 PASS, 1 FAIL (minor, non-blocking), 0 N/A.** The one failure is SEC-1 → T-0093. The
spec defers pod logs/exec (CP4) and create-from-YAML, so they are not ACs here. Known items that are filed and not
re-filed: T-0091 (CP4, exec over HTTP/1.1) and T-0092 (CP3, CSP headers). Before merge, the human runs H1–H6 below.

Test paths are abbreviated. `BE:` = `tests/FleetConsole.Api.Tests/Integration/Proxy/`, `APP:` =
`tests/FleetConsole.Application.Tests/Proxy/`, `FE:` = `web/src/`. **(QA)** marks tests added in this verify step.

## Proxy routing & access (PRX)

| AC | Evidence | Verdict |
|---|---|---|
| PRX-1 Route | BE `KubernetesProxyForwardingTests.Get_List_Reaches_The_Cluster_Unchanged_With_The_Granted_Token`, `Mutations_Reach_The_Cluster_With_Method_Raw_Path_Query_And_Body`; `ProxyEndpointPartsTests.Destination_Keeps_The_Api_Url_Prefix_And_The_Raw_Path` | PASS |
| PRX-2 Access / same 404 / 401 | BE `KubernetesProxyAuthorizationTests.Unknown_Disabled_And_Ungranted_Clusters_Are_The_Same_404` (identical shape); APP `AuthorizeProxyRequestHandlerTests.*_is_not_available` (incl. missing credential, deactivated); `ProxyAuthorizationMatrixTests` anonymous 401 | PASS |
| PRX-3 Immediate revocation | BE `ProxyRevocationTests.Revoked_Grant_Is_404…`, `Disabled_Cluster_Is_404…`, `Deactivated_User_Is_401…`, `Open_Watch_Ends_Within_The_Cap_And_The_ReWatch_After_Revocation_Is_404` | PASS |
| PRX-4 Path allowlist | APP `ProxyPathTests.Rejects_UnsafeOrForeignPaths` (40 rows: `..`, `%2e%2e`, `%2f`, `\`, `//`, absolute URL, control chars) / `Accepts_KubernetesApiPaths_Unchanged`; BE `Disallowed_Paths_Are_400_And_Not_Forwarded` | PASS |
| PRX-5 Credential rejected (502, never 401; 403 passes) | BE `Upstream_401_Becomes_502_CredentialRejected_Without_WWW_Authenticate`, `Upstream_Status_Errors_Pass_Through_Untouched(403/404/409/422)`; FE `shared/k8s/hooks.test.tsx` "sends a proxy 401 to the global handler (→ /login) but not a 502" | PASS |
| PRX-6 Upstream failures | BE `Stopped_Server_Gives_502_UpstreamUnavailable`, `Untrusted_Certificate_Gives_502_UpstreamTls`, `Response_Slower_Than_RequestTimeout_Gives_504_UpstreamTimeout`; `ProxyEndpointPartsTests.Maps_Forwarder_Errors_Without_Exception_Text` | PASS |
| PRX-7 Per-cluster TLS | BE `ProxyTlsIsolationTests.Each_Cluster_Uses_Only_Its_Own_CA_And_A_Fixed_CA_Bundle_Takes_Effect_On_The_Next_Request` (two servers/two CAs, API URL + CA change), `SkipTls_Cluster_Accepts_A_WrongHost_Certificate…`, **(QA)** `Turning_SkipTls_Off_Makes_The_Next_Request_Verify_The_Certificate` | PASS |
| PRX-8 Timeouts / unbuffered watch / 300 s cap | BE `ProxyStreamingAndAuditTests.Watch_Events_Reach_The_Client_Within_A_Second…`, `ProxyKestrelTests.Watch_Events_Reach_The_Client_Within_A_Second_Over_Sockets`, `Watch_Response_Headers_Arrive_Before_The_First_Event`, `Watch_Is_Streamed_With_Capped_TimeoutSeconds`; APP `ProxyRequestTests.ForwardedQueryString_*`; config `ProxyEndpointPartsTests.Validates_Proxy_Options` | PASS |

## Header hardening & token safety (SEC)

| AC | Evidence | Verdict |
|---|---|---|
| SEC-1 Request stripping | BE `Client_Identity_Headers_Are_Stripped_And_Only_The_SA_Token_Is_Sent` (Authorization, Cookie, X-Console-Request, Impersonate-*, X-Remote-*, X-Forwarded-*, Forwarded, Proxy-Authorization), **(QA)** `Hop_By_Hop_And_Forwarding_Headers_From_The_Client_Are_Not_Forwarded` (Keep-Alive, Proxy-Connection, X-Forwarded-Port/Prefix, X-Remote-Extra-*). **Fails:** a header the client nominates in `Connection` is forwarded. **(QA)** `ProxyKestrelTests.Connection_Nominated_Header_Is_Not_Forwarded_Over_Sockets` is skipped and points to T-0093. | **FAIL (low) → T-0093** |
| SEC-2 Response stripping | BE `Client_Identity_Headers_Are_Stripped…` (Set-Cookie, WWW-Authenticate gone; other headers kept), `Upstream_401_Becomes_502…` | PASS |
| SEC-3 CSRF on proxy | BE `Mutation_Without_Csrf_Header_Is_403_And_Not_Forwarded`; matrix row `NoCsrfHeader` | PASS |
| SEC-4 Token-leak sweep | BE `ProxyTokenLeakSweepTests.NoToken_InAnyProxyResponse_AuditEntry_DatabaseRow_OrLogLine`: allowed GET/PUT, denied, upstream 500, TLS error, credential rejected, unreachable, bad path. Checks plain, base64 and base64url forms in bodies, headers, audit, DB and logs. | PASS |
| SEC-5 Authorization matrix + enumeration | BE `ProxyAuthorizationMatrixTests.Get_And_Put_Give_The_Contract_Outcome` (all 9 spec rows), `EveryKubernetesProxyRoute_IsInTheMatrix` | PASS |

## Mutation guard (MUT)

| AC | Evidence | Verdict |
|---|---|---|
| MUT-1 Definition (incl. exec/attach/portforward/proxy) | APP `ProxyRequestTests.Classifies_VerbAndMutation`, `WebSocketUpgradeOnExec_IsAStreamingMutation`, `EncodedExecWithUpgrade_IsAStreamingMutation`, `FollowedLog_IsStreamingButNotAMutation` | PASS |
| MUT-2 ReadOnly grant | BE `ReadOnly_Grant_Mutation_Is_403_And_SelfSubjectAccessReview_Is_Forwarded`, `Denied_Mutation_Is_Audited_Once`; APP `MutationGuardPolicyTests.Messages_match_the_contract` | PASS |
| MUT-3 Read-only user, checked first | BE `ReadOnly_User_Mutation_Is_403_UserReadOnly`; APP `Either_read_only_flag_makes_the_user_read_only`, `Registered_chain_returns_user_read_only_before_body_too_large` | PASS |
| MUT-4 Review allowlist only (no dryRun) | BE `ReadOnly_Grant_Mutation_Is_403_And_SelfSubjectAccessReview_Is_Forwarded`, `Allowed_Mutation_Is_Audited_Once_And_Reads_Watches_And_Reviews_Are_Not`; APP `ProxyRequestTests.DryRun_IsStillAMutation`, SSRR rows | PASS |
| MUT-5 Body limit 413 | BE `Body_Over_The_Limit_Is_413_By_Content_Length`, `ProxyKestrelTests.Chunked_Body_Over_The_Limit_Is_413_BodyTooLarge_And_Audited_As_Denied` (configured 1 KiB); APP `RequestBodyLimitPolicyTests.*` | PASS |

## Proxy audit (PAUD)

| AC | Evidence | Verdict |
|---|---|---|
| PAUD-1 One entry, contract fields, no bodies/headers | APP `RecordProxyAuditHandlerTests.AllowedUpdate_RecordsProxyUpdate_WithExactlyTheContractDetails`, `Actions_MapEveryMutatingVerb`; BE `Allowed_Mutation_Is_Audited_Once…`; **(QA)** `NotAvailable_Mutation_Is_Audited_As_NoAccess_And_NotAvailable_Get_Is_Not` (dryRun, fieldManager, ns/name, correlation id, no body/header keys) | PASS |
| PAUD-2 Denials audited; 404 only for mutations; GET/watch not | BE `Denied_Mutation_Is_Audited_Once`, `Allowed_Mutation_Is_Audited_Once_And_Reads_Watches_And_Reviews_Are_Not`, **(QA)** `NotAvailable_Mutation_Is_Audited_As_NoAccess…`; `Chunked_Body_Over_The_Limit…_Audited_As_Denied` | PASS |
| PAUD-3 Failures still audited; audit failure never blocks | BE `Client_Leaving_During_A_Put_Is_Audited_With_Status_0`, `Put_To_An_Unreachable_Cluster_Is_Audited_With_Status_502`, `Failing_Audit_Write_Leaves_The_Response_Unchanged_And_Logs_Error_2400` | PASS |
| PAUD-4 Proxy category, resource + outcome, cluster filter | FE `features/admin/audit/AuditLogPage.test.tsx` "PAUD-4: proxy entries show the resource and its outcome; Proxy is a category", `proxyOutcome.test.ts`; **(QA)** BE `Admin/Audit/AuditEndpointsTests.Proxy_Category_And_Cluster_Filter_Select_Proxy_Entries` | PASS |

## Cluster switcher & context (SW)

| AC | Evidence | Verdict |
|---|---|---|
| SW-7 Search | FE `features/cluster-context/clusterContext.test.tsx` "ClusterSwitcher search (SW-7)" ×4 (focus, name/display/env filter, Enter, no-match text) | PASS |
| SW-8 Recents | same file, "recent clusters (SW-8)" ×4 (per user, max 5, de-dup, ungranted hidden, omitted when empty) | PASS |
| SW-9 Keep context on switch | `clusterContext.test.tsx` "keeps the path and filters…"; `clusterSwitchPath.test.ts`; `app/layout/AppShell.test.tsx` "switches cluster while keeping the current page"; `ResourceDetailsPage.test.tsx` "shows not found after switching to a cluster without the object" (link to list, no redirect) | PASS |
| SW-10 Environment visibility | `AppShell.test.tsx` "environment band (SW-10)" prod/staging; `ResourceActions.test.tsx` "deletes a pod from the list: the modal names namespace, cluster and environment"; **(QA)** `ResourceYamlTab.test.tsx` "names the cluster and its environment label next to Save (SW-10)". Note: development is **green** (CP1 CLU-7) while SW-10 says "default" — spec inconsistency, left as is | PASS |
| SW-11 Fleet vs cluster nav | `AppShell.test.tsx` "renders registry-driven navigation sections and an admin section" (`Home, Workloads, Networking, Administration, Fleet administration`); `features/admin/admin.test.tsx` "hides the Fleet administration sidebar section from a non-admin" | PASS |

## Project selector (NS)

| AC | Evidence | Verdict |
|---|---|---|
| NS-1 Projects or namespaces, searchable | FE `features/resources/list/projectSelector.test.tsx` "lists the projects of dev-1 … filters by search", "lists namespaces on vanilla Kubernetes", "shows a project created while the menu is open" | PASS |
| NS-2 URL + remembered per cluster | same, "navigates to the chosen project keeping the query, and remembers it per cluster" (incl. entering `/k8s/configmaps` without ns) | PASS |
| NS-3 Typed fallback | same, "falls back to a typed project name when projects cannot be listed" | PASS |
| NS-4 Default projects toggle | same, "shows default projects once the toggle is on and remembers the toggle", "always shows the selected project" | PASS |

## Registry & data layer (DATA)

| AC | Evidence | Verdict |
|---|---|---|
| DATA-1 Registry, six kinds | FE `features/resources/registry/registry.test.ts`; `registry/kinds/kinds.test.tsx` "navigation (UI-2): lists every CP2 kind on OpenShift" | PASS |
| DATA-2 Discovery hides unserved kinds, once per cluster | `shared/k8s/hooks.test.tsx` "useK8sDiscovery…hides projects on vanilla lab-1"; `kinds.test.tsx` "hides Projects where project.openshift.io is not served"; `ResourceListPage.test.tsx` "says a registered kind is not available…"; `staleTime: Infinity` in `shared/k8s/discovery.ts` | PASS |
| DATA-3 Paging, watch, 410 relist, backoff, paused indicator | `hooks.test.tsx` "applies watched add / modify / delete…", "relists after compaction (410)…", "pauses on a watch error … backoff reconnect", "watch backoff floor"; `ResourceListPage.test.tsx` "live updates (DATA-3)" ×2 ("Paused — retrying" = spec §5 wording) | PASS |
| DATA-4 2,000 pods | `ResourceListPage.test.tsx` "pages 2,000 pods, filters them and applies a watch update to a visible pod" | PASS |
| DATA-5 Watch lifecycle, one per key | `hooks.test.tsx` "shares one stream per key, aborts it on unmount and on a namespace change" | PASS |

## Pages (UI)

| AC | Evidence | Verdict |
|---|---|---|
| UI-1 Routes, unknown plural | FE `features/resources/paths.test.ts`; `ResourceListPage.test.tsx` "says a kind is not supported yet…", "redirects a namespaced plural under the cluster scope…"; `kinds.test.tsx` "shows the project details" (cluster scope) | PASS |
| UI-2 Nav, landing on Projects | `kinds.test.tsx` "navigation (UI-2)" ×2; `ResourceListPage.test.tsx` "cluster landing (UI-1/UI-2)" ×2; `AppShell.test.tsx` "expands the section of the current page…" | PASS |
| UI-3 List page | `ResourceListPage.test.tsx` "resource list filters and sorting (UI-3)" ×8 (name/label/status/type filters, sort, Namespace column only in all-projects, pod columns), **(QA)** "lists events with the UI-3 columns and links a registered involved object"; `kinds.test.tsx` deployments/services/projects/namespaces column tests; `shared/ui/uiKit.test.tsx` relative time + absolute tooltip | PASS |
| UI-4 Details tab | `ResourceDetailsPage.test.tsx` "pod details (UI-4)" ×3, "config map details (UI-4)" ×3; `kinds.test.tsx` deployment/service/project/namespace details | PASS |
| UI-5 Events tab | `ResourceDetailsPage.test.tsx` "opens on Events from the URL and lists only the object's events, newest first, live", "shows the exact empty text" | PASS |
| UI-6 YAML view | `ResourceYamlTab.test.tsx` "hides managedFields until toggled and offers Copy and Download", "alice on prod-eu-1: read-only editor with the reason and no Save"; e2e `browse.e2e.ts` | PASS |
| UI-7 YAML save | `ResourceYamlTab.test.tsx` "YAML tab save (UI-7, QG-3)" ×6 (success toast, 409 + Reload, 422 verbatim, out-of-band banner, leave guard, client-side errors incl. changed kind/name, never a PUT without resourceVersion) | PASS |
| UI-8 Delete | `ResourceActions.test.tsx` "resource actions (UI-8)" (list + details, 403 in modal, return to list), `DeleteResourceModal` "asks for the name…"; `kinds.test.tsx` "asks for the name before deleting a project or namespace" | PASS |
| UI-9 `useCanI` gating | `ResourceActions.test.tsx` "useResourceAccess (UI-9)" (reasons 1–2 without SSAR, reason 3 RBAC sentence), "while the access review is pending, Delete is disabled without a tooltip", "rows of one namespace share a single access review"; `hooks.test.tsx` "useCanI dedupes…"; 60 s TTL in `shared/k8s/access.ts` | PASS |
| UI-10 Error states | `ResourceListPage.test.tsx` "resource list states (QG-3, UI-10)" (skeleton, empty, 403 Restricted access, 502 detail + Retry without logout); `ResourceDetailsPage.test.tsx` "details error states (UI-10)" ×5 | PASS |

## Quality gates (QG) and contract

| AC | Evidence | Verdict |
|---|---|---|
| QG-1 BE integration vs fake HTTPS API server | All `BE:` files above (FakeKubeApiServer + test CA, Postgres Testcontainers, Kestrel variant) | PASS |
| QG-2 Table-driven unit tests | APP `ProxyPathTests`, `ProxyRequestTests`, `KubernetesRequestInfoTests` (subresources incl. `pods/eviction`, `deployments/scale`, core vs named groups, legacy prefixes) | PASS |
| QG-3 FE MSW coverage | Rows above. **(QA)** extended the list-state tables (loading/empty/403/502) to deployments and services. Projects/namespaces have the same generic page, and their listing is covered in `kinds.test.tsx`. | PASS |
| QG-4 Playwright smoke + browse step | `web/e2e/auth.e2e.ts` H1–H2, `switcher.e2e.ts` H3–H4, `browse.e2e.ts` "QG-4: browsing as alice" ×2 — 6/6 green | PASS |
| QG-5 Gates green, generated admin types | Both scripts green; audit types come from `@/shared/api` (generated), proxy details parsed with zod in `proxyOutcome.ts` because `details` is free-form JSON | PASS |
| Contract §4 check order | Matrix + APP `Policies_run_in_registration_order_and_the_first_refusal_wins`, `Registered_chain_returns_user_read_only_before_body_too_large`; `ProxyEndpointPartsTests.Every_Proxy_Error_Has_Its_Contract_Status` | PASS |
| Contract §2 WebSocket origin | BE `WebSocket_Upgrade_From_A_Foreign_Origin_Is_403` (foreign + missing Origin); `ProxyKestrelTests.WebSocket_Exec_Is_Forwarded_With_The_SA_Token_And_Audited_As_Connect` | PASS |
| Contract §5 audit actions/target/details | APP `RecordProxyAuditHandlerTests` (all actions, kubectl-style target, non-resource path, denied reason) | PASS |
| Contract §7 config keys | `ProxyEndpointPartsTests.Validates_Proxy_Options`; variants using `Proxy:RequestTimeout` and `Proxy:MaxMutationBodyBytes` | PASS |

## Defects

| Id | Severity | AC | Summary |
|---|---|---|---|
| T-0093 | low, non-blocking | SEC-1 | A request header the client names in `Connection` is forwarded upstream. The fixed hop-by-hop set is stripped. It cannot leak credentials, but it is an RFC 9110 §7.6.1 miss. |
| T-0094 | low (test only, CP3) | — | `DevOAuthConfigurationTests.InvalidConfiguration_FailsAtStartup` flaked once in 4 full runs under parallel load; pre-existing, not a CP2 AC. |

## Manual checks for the human (real OpenShift clusters, before merge)

Run against two real managed clusters you are allowed to read from. Use a **test** namespace for H4.
- **H1 Real CA / TLS.** Register cluster A with its real CA bundle and cluster B with system trust. Both list Pods.
  Swap A's CA for B's: Pods shows "The TLS certificate of `<A>` could not be verified." Restore it.
- **H2 Expired SA token.** Assign a deliberately revoked or expired token. Pods shows the CredentialRejected message
  with Retry. You stay logged in.
- **H3 Watch through the OpenShift router.** Open Pods with "Live". In another terminal, run `oc get pods -w`
  (read-only) and let the cluster schedule a pod normally. The row appears within ~1 s, and the indicator stays
  Live for over 5 minutes (re-watch after the 300 s cap).
- **H4 Save and delete on a test namespace** with a ReadWrite grant. Edit a ConfigMap and Save: toast, then the audit
  log shows `proxy.update` with status 200 under the Proxy filter. Delete it: the modal names cluster + env, and the
  audit shows `proxy.delete`.
- **H5 RBAC reason 3.** Use a view-only SA on a ReadWrite grant. Delete is disabled with "The service account for
  `<cluster>` cannot delete …".
- **H6 Look and feel with 40 clusters.** Switcher search and recents. The prod environment label is red in the
  masthead and next to Save. Development shows **green** (CP1 CLU-7): confirm that is acceptable versus SW-10's
  "default".

## Product owner acceptance

**2026-11-20 · Verdict: ACCEPT-WITH-FOLLOWUPS.** 54/55 ACs verified by QA evidence above; SEC-1 is a narrow RFC miss
with no credential exposure (client `Authorization`/`Cookie`/`Impersonate-*` are already stripped) → T-0093 must land
before merge, not a reason to reject. Clicked through `dev:mock` as admin and alice at 1440 px: Projects landing, Pods
all-projects with `CrashLoopBackOff` status and filter, pod details + containers table, read-only YAML on prod-eu-1
with reason, Events tab, switcher search/recents with env + "Read only" labels, prod (red) / staging (yellow) band,
ConfigMap kebab → delete modal naming project, cluster and `staging` label. Matches OCP muscle memory (Details/YAML/
Events tabs, kebab Edit YAML/Delete, project selector).
**SW-10 ruling:** development = **green**, as CP1 CLU-7 — one colour per environment across admin and masthead. Spec
wording fixed; H6 only needs to confirm prod red / staging orange-yellow are distinct on real monitors.
**Follow-ups (later):** T-0095 list headers truncate at 1440 px (Pods: "N…", "R…", "Cr…"), CP4; T-0096 typed-name
confirmation for any delete on production clusters, CP4; T-0097 hide cluster nav on the "cluster not available" page, CP6.
Human manual checks H1–H6 still required before merge.
