---
id: T-0382
title: Namespace selector fallback — list fallbackNamespaces when namespaces can't be listed, "Go to namespace" entry (NSF-1/2/5)
status: todo
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
- [ ] NSF-1: on `dev-k8s-ns` the open selector lists `team-a` with the helper text; no error text; no namespace list
  request is sent when the SSAR says no.
- [ ] NSF-1 response-driven: SSAR allowed but list 403 → same fallback rendering.
- [ ] NSF-2: no "All namespaces"; typing `team-b` shows `Go to namespace "team-b"` first and selecting it calls
  `onSelect('team-b')`; typing `Bad_Name` shows no Go-to item and Enter shows the DNS-label error; typing `team-a`
  shows no Go-to item.
- [ ] Fallback with `[]`: helper text + Go-to entry only.
- [ ] OpenShift / listable cluster unaffected (existing tests unchanged and green); NSF-5: a 403 list in `shop` on
  `dev-k8s-ns` still shows the forbidden list state.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
