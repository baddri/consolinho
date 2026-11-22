# CP3.7 verify — fleet foundations (qa-engineer, 2026-11-23, branch `cp/3.7-fleet-foundations`)

**Verdict: PASS.** All 40 criteria in §4.1–§4.6 have passing tests and/or a reproducible manual check. No product bug
was found, so no bug task was filed. Three test-only problems were fixed (see Gates). THEME-4 needs a note: the mock data
has no Kubernetes production cluster, so I checked it on a cluster I edited myself.

## Gates
- `scripts/check-be.sh`: build ok; 333 + 705 + 792 = 1830 tests pass.
- `scripts/check-fe.sh`: lint, typecheck, build ok; Vitest 78 files / 891 tests pass.
- e2e (Aspire `http` profile, `npm run e2e`): **10/10 pass** (H1-H2, QG-4 ×2, HOST-3, L1-L2, **H3 first run**, H4, H5).
  The test-only fixes that made this pass:
  1. `web/e2e/global-setup.ts`: cluster registration now sends `distribution: 'openShift'`. Without it the request got a 400, as DIST-4 requires.
  2. `web/e2e/switcher.e2e.ts` H3 and `web/e2e/layout.e2e.ts` L1: the selector for "Search clusters" changed from
     `textbox` to `combobox`, following T-0153's intended role change.
  3. FLEET-7: `tests/.../AuthEndpointsTests.cs` (`Login_WhenAlreadySignedIn_…`) and `ReturnUrlPolicyTests.cs` used
     `/admin/users`. Both now use `/fleet/admin/users`, and the 48 tests in those classes pass.
- Manual: `vite --mode mock` on :5347 plus a throw-away Playwright script, 1280 light, admin + alice. The server was stopped afterwards.

## Traceability
| AC | Verdict | Evidence |
|---|---|---|
| SW-1 | PASS | `clusterContext.test.tsx` "cluster identity (SW-1..6)". Manual: menu shows "Development 1 \| … \| dev-1" with the name as description |
| SW-2 | PASS | `clusterContext.test.tsx` L68 (one line, title + tags). T-0147 ux round 2 confirmed truncation and tooltip |
| SW-3 | PASS | `clusterType.test.tsx`, SW-1..6 block. Manual: toggle "Lab 1 \| K8s \| dev", items show OCP/K8s |
| SW-4 | PASS | SW-1..6 block. Manual (alice): "Read only" label on items only. e2e H3 toggle name "Cluster e2e-smoke-… (OCP, dev, read only), switch cluster" |
| SW-5 | PASS | `clusterContext.test.tsx` L84 (type, env, Read only). Manual: item order OCP \| prod \| Read only |
| SW-6 | PASS | SW-1..6 block. Manual: `k8s`/`kubernetes` → Lab 1, `ocp`/`openshift` → Development 1 |
| SW-7 | PASS | Older switcher suites (recent, keeps context, gate) green. The only e2e change was the T-0153 combobox role (Gates 2) |
| DIST-1 | PASS | `ClusterTests` rejects `(ClusterDistribution)9`. `ClusterQueriesTests.DistributionColumn_DefaultsRowsFromBeforeTheMigrationToOpenShift`. Migration `ClusterDistribution` |
| DIST-2 | PASS | `ClusterForm.test.tsx` DIST-2 ×2 (required/preselected; change leaves tests current). `ClusterTests` changed-field table (`distribution` not a connection change). `ClusterAuditHandlerTests`. Manual: edit radios |
| DIST-3 | PASS | `ClustersListPage.test.tsx` L61. Manual: Type column OCP/K8s/K8s/OCP/OCP/OCP; lab-1 details "Distribution: Kubernetes" |
| DIST-4 | PASS | `RegisterClusterTests` missing/null/unknown → 400; `UpdateClusterTests`; `ClusterQueriesTests.Detail_And_List_…`; `ClustersEndpointsTests.Returns_The_Declared_Distribution`; `schema.gen.ts` |
| DIST-5 | PASS | `distributionDiscovery.test.tsx` covers both mismatches (OpenShift w/o projects → Namespaces; Kubernetes with projects → Projects). ADR-0032 |
| DIST-6 | PASS | grep finds no "OpenShift" in per-cluster screens. "OpenShift" appears only in admin, login and About copy. Manual: lab-1 sidebar and main have no "OpenShift" |
| DIST-7 | PASS | `ConnectionTesterTests` (both mismatch wordings, never fails); `ConnectionTestEndpointsTests.TestToken_OnKubernetesDeclaredOpenShiftCluster_WarnsAboutTheMismatch`; `mocks/clusters.test.ts` |
| DIST-8 | PASS | `ConnectionTesterTests.Kubernetes_declared_and_not_served_…skips_ClusterVersion_without_calling_it`; `ConnectionTestEndpointsTests.TestCredential_OnKubernetesCluster_…SkipsClusterVersion` |
| FLEET-1 | PASS | `clusterContext.test.tsx` "fleet perspective (FLEET-1/2/5)". Manual: listboxes [Fleet, All clusters] with a divider; entry stays while searching; alice 0 entries. e2e H5 |
| FLEET-2 | PASS | `router.test.tsx` `/fleet` → `/fleet/admin/users`. Manual: toggle "Fleet management", name "Fleet management, switch cluster", no tags |
| FLEET-3 | PASS | `AppShell.test.tsx` L112. Manual: fleet sidebar = "Fleet administration" only |
| FLEET-4 | PASS | `AppShell.test.tsx` L79, `clusterContext.test.tsx` L855. Manual: lab-1 sidebar has no Fleet administration |
| FLEET-5 | PASS | FLEET-1/2/5 block. Manual: fleet → lab-1 lands on `/c/lab-1/k8s/cluster/namespaces` with the cluster sidebar |
| FLEET-6 | PASS | `LegacyAdminRedirect.test.tsx` (query/hash, unknown rest, returnUrl). Manual: `/admin/clusters?x=1#y` → `/fleet/admin/clusters?x=1#y` |
| FLEET-7 | PASS | grep: `/admin/` appears only in the redirect and its tests after the fixture fix (Gates 3). The `AuthenticationSetupTests` synthetic `/admin` endpoint is not a link. `/api/admin` is unchanged |
| FLEET-8 | PASS | `AppShell.test.tsx` L131. Admin API authorization tests unchanged and green. Manual: alice on `/fleet/admin/users` and `/admin/audit` sees the forbidden page |
| FLEET-9 | PASS | `AppShell.test.tsx` L263/L296. Manual: on fleet pages there is no `data-cluster-type`, no band, and the PF masthead |
| THEME-1 | PASS | `AppShell.test.tsx` L280. Manual: lab-1 masthead rgb(0,51,102); dev-1/fleet stay PF default |
| THEME-2 | PASS | `data-cluster-type` attribute + `clusterTheme.module.css`; tokens in UX.md §2a; no inline style |
| THEME-3 | PASS | T-0149 ux round 2 APPROVE with probe numbers: text 12.6:1, icons 11.3:1, border 5.0:1, focus 6.95:1, accent 3.97:1, light + dark |
| THEME-4 | PASS | Manual: lab-1 edited to Production. The toggle shows K8s; the band (rgb(251,197,197), 29 px, "Production cluster lab-1") sits right under the navy masthead and above content. No fixture covers K8s + prod |
| THEME-5 | PASS | `AppShell.test.tsx` L332. Manual: lab-1 → dev-1 via switcher re-themes without a reload |
| NST-1 | PASS | `TestConnection.test.tsx` L74/L202 and `ClusterCredentialsTab.test.tsx` L181 check the label and helper text. T-0150 ux APPROVE |
| NST-2 | PASS | `InspectNamespaces_*` domain tests (trim, dedup, 10/11, per-entry errors); `CredentialValidatorTests`; `ConnectionTestEndpointsTests.InvalidNamespaceLists_Are400_AndNeverReachTheCluster`; `TestConnection.test.tsx` NST-1/2 and NST-2 |
| NST-3 | PASS | `ConnectionTesterTests.Several_namespaces_one_forbidden_one_hanging_…keep_order_and_warn`, `Rules_reviews_are_bounded_to_four_in_flight`, `Rejected_token_in_one_namespace_…` |
| NST-4 | PASS | `ConnectionTestResultView.test.tsx` NST-4 ×2. T-0151 ux APPROVE |
| NST-5 | PASS | `CredentialTests` (rotate keeps, RecordTest replaces/clears); `ConnectionTestEndpointsTests` L85 (empty clears); `CredentialsEndpointsTests.Add_WithInspectNamespaces_…`; `TestConnection.test.tsx` NST-5/6 |
| NST-6 | PASS | `ClusterCredentialsTab.test.tsx` L306/L319 (dash when empty, list shown, rotate prefill); `TestConnection.test.tsx` NST-5/6 |
| NST-7 | PASS | `CredentialAuditHandlerTests.CredentialAdded_Records…Namespaces`; the token-leak sweep in `CredentialsEndpointsTests` L311 now includes namespaces |
| NST-8 | PASS | grep: `inspectNamespaces` is used only in the credential/connection-test code paths (BE and FE) |
| ADR-1 | PASS | ADR-0032 (distribution vs discovery), 0033 (fleet routes), 0034 (groups/priority), 0035 (access cache). No FusionCache/group-grant code (grep) |
| QG-1 | PASS | Both gates green; the layers listed in QG-1 have tests (rows above) |
| QG-2 | PASS | ux APPROVE: switcher T-0147 r2 / T-0152 / T-0153, Kubernetes masthead T-0149 r2 (light + dark, contrast). The fleet sidebar was confirmed unchanged in T-0145 r2. That round's open items went to T-0153, which got APPROVE |

## Edge probes
- Non-admin opening `/fleet/...` or legacy `/admin/...` URLs gets the forbidden page. Alice's fleet sidebar shows only the toggle, with no sections.
- No page errors in any manual run. Disabled `dev-2` (K8s) is listed but cannot be selected.

## Bugs / follow-ups filed
- No bug tasks.
- Suggestion (not filed): add a Kubernetes production cluster to the mock fixtures, so THEME-4 can be reviewed without editing data.
