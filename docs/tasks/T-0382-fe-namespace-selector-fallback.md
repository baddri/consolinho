---
id: T-0382
title: Namespace selector fallback — list fallbackNamespaces when namespaces can't be listed, "Go to namespace" entry (NSF-1/2/5)
status: done
owner: frontend-engineer
checkpoint: 5.5
depends_on: [T-0378, T-0381]
paths: [web/src/features/cluster-context/NamespaceSelector.tsx, web/src/features/cluster-context/NamespaceSelector.test.tsx, web/src/features/cluster-context/useNamespaceFallback.ts, web/src/features/cluster-context/useNamespaceFallback.test.tsx, web/src/features/cluster-context/useProjectOptions.ts, web/src/features/cluster-context/index.ts]
review_rounds: 0
---

## Goal
Alice's namespaced token can't list namespaces; today the selector shows an error and asks her to type a name. Show the
namespaces her admin configured instead (spec NSF-1), never offer "All namespaces" there, and let her jump to any
valid name she types (NSF-2). Lists that 403 inside a chosen namespace keep today's forbidden state (NSF-5).

## Scope
- In: new hook `useNamespaceFallback`; fallback rendering in `NamespaceSelector`; tests.
- Out: landing/redirect behaviour (T-0383); Create Namespace (T-0385); any change to the non-fallback (OpenShift or
  listable) selector behaviour, including NS-3's typed entry for non-403 errors.

## Contract / design notes
- **Hook** (`useNamespaceFallback.ts`, exported from the feature index — T-0383 uses it):
  ```ts
  export interface NamespaceFallback {
    /** `true` = the token may not list the selector's kind; `undefined` while discovery/SSAR are pending. */
    isFallback: boolean | undefined;
    /** `AccessibleCluster.fallbackNamespaces` of `cluster` (saved order), `[]` when none or unknown. */
    namespaces: string[];
  }
  export function useNamespaceFallback(cluster: string): NamespaceFallback;
  ```
  Kind = `ProjectModel` if discovery serves it, else `NamespaceModel` (same rule as `useProjectOptions`). Decision via
  `useCanI(cluster, { verb: 'list', model })` (cached 60 s, deduped; fails open = not fallback). Namespaces from
  `useAccessibleClusters()`. Works on any distribution (DIST-5): no distribution check.
- **Selector**: `useProjectOptions(cluster, enabled)` gets the list disabled when `isFallback === true` (no doomed
  request). Fallback mode = `isFallback === true` **or** the list failed with `code === 'Kubernetes.Forbidden'`
  (response-driven, spec NSF-1). In fallback mode:
  - items = `namespaces` (filtered by the search text), plus the selected namespace if it isn't in the list;
  - no "All namespaces" item (NSF-2);
  - while typing a valid DNS-1123 label (existing `namespaceName` schema) that isn't an exact item, the **first** item
    is `Go to namespace "<typed>"` (spec §5, OCP "type to filter" pattern); selecting it or Enter chooses the name.
    Enter with an invalid name keeps today's inline error;
  - the footer shows subtle `HelperText`: "You can't list namespaces on this cluster. Showing the namespaces
    configured for your access." (use the noun: "projects" on OpenShift) instead of the "Show default …" switch;
  - toggle text when `namespace` is `undefined`: `Namespace: Select a namespace` (no "All namespaces" wording);
  - zero fallback namespaces: the menu shows only the search box, the Go-to item when typing, and the helper text.
- Non-403 errors keep the NS-3 behaviour unchanged. Update the component TSDoc.
- No new query keys (SSAR via `k8sQueryKeys.access`, list via existing key).

## Context pack
- Docs: `FRONTEND.md` § Session and permissions (ADR-0014), § Data fetching rules.
- Touch points: `web/src/features/cluster-context/NamespaceSelector.tsx:NamespaceSelector` (items() L113-128,
  footer L173-180, onSearch L104-112, `fallbackText` L44); `useProjectOptions.ts:useProjectOptions` (L39-55);
  `web/src/shared/k8s/access.ts:useCanI` (L37); `useAccessibleClusters` (feature index);
  `web/src/shared/forms/dnsLabel.ts:dnsLabel`.
- Test exemplar: `web/src/features/cluster-context/NamespaceSelector.test.tsx` (existing 403 → typed-name case);
  `renderApp` from `web/src/test/render`, `mockDb` from `web/src/test/handlers`; cluster `dev-k8s-ns` (T-0381) for
  403 + list; empty case: clear the credential's `inspectNamespaces` in `mockDb`.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/namespace/NamespaceDropdown.tsx`
  (menu structure, filter, footer) and `NamespaceMenuToggle.tsx`.

## Acceptance criteria
- [x] NSF-1: on `dev-k8s-ns` the open selector lists `team-a` with the helper text; no error text; no namespace list
  request is sent once the denial is known (first open may send one 403 list in parallel; orchestrator decision, review round 1).
- [x] NSF-1 response-driven: SSAR allowed but list 403 → same fallback rendering.
- [x] NSF-2: no "All namespaces"; typing `team-b` shows `Go to namespace "team-b"` first and selecting it calls
  `onSelect('team-b')`; typing `Bad_Name` shows no Go-to item and Enter shows the DNS-label error; typing `team-a`
  shows no Go-to item.
- [x] Fallback with `[]`: helper text + Go-to entry only.
- [x] OpenShift / listable cluster unaffected (existing tests unchanged and green); NSF-5: a 403 list in `shop` on
  `dev-k8s-ns` still shows the forbidden list state.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-26 frontend-engineer: `useNamespaceFallback` (discovery kind + SSAR list, accessible clusters' fallbackNamespaces);
  selector fallback mode (SSAR no or list 403): configured names, Go-to item, footer HelperText, "Select a …" toggle.
  Tests in NamespaceSelector/useNamespaceFallback tests; NS-3 test moved to a 500; ResourceListPage cold-start wait.
- 2026-11-26 frontend-engineer, round 1 fixes: empty Enter in fallback does nothing (+test); the list now starts in
  parallel with the SSAR (orchestrator overrode the reviewer's keep-serial nit) and is skipped once the SSAR says no;
  NSF-1 test asserts no list request on reopen; 500-case text asserted in full; lines wrapped to 120.

## Review
- 2026-11-26 frontend-architect, round 1: **CHANGES_REQUESTED**
  - `web/src/features/cluster-context/NamespaceSelector.tsx:137-141` — in fallback mode, Enter with an empty search box
    picks `configured.names[0]`, so opening the menu in `team-b` and pressing Enter jumps to `team-a`. Non-fallback
    mode (L150) and NS-3 do nothing or validate in this case. Required fix: return early when `typed` is empty, matching
    `if (needle && first)`. Add a test: open in `team-b`, press Enter, and the path is unchanged.
  - Toggle wording before the first open: **accepted as a split, not an AC miss.** The T-0370 AC (0 SSARs on render)
    is binding. The open-menu test asserts "Select a namespace", and T-0383's redirects warm the shared SSAR cache.
    The only cold case left is a deep link to `k8s/all-namespaces/...`, where "All namespaces" correctly describes the
    URL. Orchestrator: add a T-0383 AC that the toggle on `NoNamespacesPage` reads `Namespace: Select a namespace`.
  - Nit (optional): `NamespaceSelector.tsx:83` and `:237` exceed 120 columns. Re-wrap the TSDoc line and split the
    helper-text JSX line.
  - Nit (optional): the list waits for the SSAR (`isFallback === false`) on every cluster, so OpenShift users get one
    SSAR round trip (cached 60 s) before the projects list. This is acceptable because the "no doomed request" AC needs
    it. Mention it in the hook TSDoc and keep it that way.
  - Nit (optional): `projectSelector.test.tsx` NS-3 now matches only `/; enter a project name\.$/`. Assert the full
    500 text (`etcd is unavailable; enter a project name.`).
  - Checked OK: OCP parity (same Menu/MenuSearch/MenuList/MenuFooter structure as `NamespaceDropdown.tsx`, `Kind: title`
    toggle as OCP L395); feature boundaries; data via `shared/k8s` `useCanI` (key includes cluster, no new keys);
    loading/empty/error states; no `any`/DOM; a11y labels; MSW tests cover every AC; TSDoc on the hook and component.
    The edit to `ResourceListPage.test.tsx` outside `paths` is noted in the handover and acceptable.
- 2026-11-26 frontend-architect, round 2: **APPROVE**
  - Verified: an empty Enter in fallback mode returns early (`NamespaceSelector.tsx` onSearch), and the new test
    "does nothing on Enter with an empty search box" covers it. The list now runs in parallel with the review
    (`isFallback !== true`, the orchestrator's decision), and the NSF-1 test checks that no list request is sent once
    the "no" is cached. The 500 case asserts the full text. No regressions in the touched code: when the review is
    pending and the list 403s, the selector still enters fallback through `error.code`.
  - Nit (optional, follow-up only): `NamespaceSelector.tsx:84` is still 178 columns because the TSDoc re-wrap was
    missed. Orchestrator: reword the NSF-1 AC to "no list request after the denial is known", as agreed.

## Handover notes
- Fallback = `isFallback === true` or list error `Kubernetes.Forbidden`; the list is requested only once the SSAR says
  `isFallback !== true`: in parallel with the SSAR on first open (one possibly doomed list), never after a cached "no".
  Never fetches the Namespace object.
- Go-to item id is `#go-to:<name>`; Enter picks Go-to, else first filtered name, else shows the DNS-label error.
- Outside `paths`: `resources/list/projectSelector.test.tsx` NS-3 case now answers 500 (a 403 is fallback now, as the
  spec requires); `ResourceListPage.test.tsx` "Kind not supported yet" uses `COLD_START_TIMEOUT_MS` (orchestrator ask).
- Hook takes optional `{ enabled }` (contract-compatible); the selector reviews only when opened (T-0370: no SSAR on
  render), so before the first open the toggle still says "All namespaces"; T-0383 calling the hook warms the cache.
- UI probe: OCP reference wasn't running on :9000, and the probe can't open menus; only ours checked. Menu parts are
  the same PF Menu/MenuItem/MenuFooter as the listable mode.
