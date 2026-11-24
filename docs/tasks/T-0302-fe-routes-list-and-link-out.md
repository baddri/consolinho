---
id: T-0302
title: Routes list — Status, Location link-out, Service (RT-1, RT-2)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0300]
paths: [web/src/features/resources/registry/kinds/routes.tsx, web/src/features/resources/networking/linkOut.ts, web/src/features/resources/networking/linkOut.test.ts, web/src/features/resources/networking/routes]
review_rounds: 0
---

## Goal
The Routes list shows whether each route is admitted and where it is served, with a safe clickable Location, so
Marco opens the app in one click and sees at a glance which route isn't served.

## Scope
- In: list columns, status getter, the shared safe host-URL builder (also used by Ingress, T-0304), `RouteLocation`.
- Out: details page (T-0303); Backend health column (needs Endpoints per Service = extra API → omitted, parity row
  gap, RT-1); Route form (RT-4).

## Contract / design notes
- **`networking/linkOut.ts`** (pure, the only place a cluster-supplied host becomes an `href`):
  `hostUrl({ host, path, tls }: { host?: string; path?: string; tls: boolean }): string | undefined` — returns
  `` `${tls ? 'https' : 'http'}://${host}${path ?? ''}` `` only when `host` is a DNS-1123 subdomain (lowercase
  labels `[a-z0-9]([-a-z0-9]*[a-z0-9])?` joined by `.`, ≤ 253 chars, no `*`) and `path` is empty or starts with `/`
  and contains no `//`, `\`, whitespace or control chars; else `undefined`. Never parses user input with `new URL`
  as an allow decision. Unit tests: valid host/path, `javascript:alert(1)`, `//evil.com`, `evil.com/..`, `*.wild…`,
  uppercase, trailing dot, `host@evil`, path `//x`, empty host.
- **`networking/routes/routeStatus.ts`**: `routeStatus(route): 'Accepted' | 'Rejected' | 'Pending'` from
  `status.ingress[].conditions[type=Admitted]` (any True → Accepted, else any False → Rejected, else Pending), as
  *(np)* `RouteStatus.tsx`; descriptor `status` returns it (shared `Status` icons: Accepted/Rejected exist; Pending →
  check `Status.tsx` table). Also `routeHost(route)` = admitted ingress host or `spec.host`.
- **`networking/routes/RouteLocation.tsx`** (*(np)* `RouteLocation.tsx` / `RouteLinkAndCopy.tsx`): Accepted, not
  wildcard and `hostUrl` defined → PF `ExternalLinkButton variant="link" isInline` (`@patternfly/react-component-groups`,
  as `shared/ui/page/DetailsGrid.tsx` L89; it sets `target="_blank"` + `rel="noopener noreferrer"` — assert in test),
  link text = the full URL (OCP `RouteLinkAndCopy` → `ExternalLinkWithCopy`, `public/components/utils/link.tsx`: link + copy button; copy via PF
  `ClipboardCopy variant="inline-compact"` or the existing `workloads/config/CopyableValue.tsx` — mirror OCP's look);
  otherwise plain host text (wildcard, pending, rejected, invalid host) or `DASH` (OCP `getRouteLabel`).
- **Columns** (*(np)* `useRouteColumns.ts`, same order): Name, Namespace, Status (`routeStatus` with icon), Location
  (`RouteLocation`, sort by host), Service (`ResourceLink` to `spec.to.name` Service, SVC badge) — the np titles
  are exactly Name, Backend health, Namespace, Status, Location, Service; we omit Backend health only. `filters`: Status (Accepted/Rejected/Pending) only if OCP's list
  has the row filter (check `RoutesList.tsx`).
- Put this task's tests in `networking/routes/routes.test.tsx` and `networking/linkOut.test.ts` (not `kinds.test.tsx`,
  shared with the other lane).

## Context pack
- Docs: SECURITY.md is not touched; RT-2 is the rule. UX.md §5 (list pages).
- Exemplars: `registry/kinds/services.tsx` (column defs, `ServiceLocation`); `workloads/deploymentconfigs/deploymentConfigDetails.tsx`
  L160-176 (`ExternalLinkButton` usage); `registry/kinds/jobs.tsx` (status getter + column).
- Touch points: `registry/kinds/routes.tsx` (minimal from T-0300); `components/ResourceLink.tsx:ResourceLink`.
- OCP reference: *(np)* `src/views/routes/list/RoutesList.tsx`, `hooks/useRouteColumns.ts`, `components/{RouteRow,RouteStatus,RouteLocation,RouteLinkAndCopy}.tsx`
  (read with `gh api repos/openshift/networking-console-plugin/contents/<path> --jq .content | base64 -d`);
  `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/links/ExternalLink.tsx`.

## Acceptance criteria
- [x] RT-1: dev-1 `shop` Routes list shows `web` Accepted with an external link, `pending` Pending, `rejected` Rejected, `wildcard` host as text.
- [x] RT-2: `hostUrl` unit tests incl. `javascript:` and `//evil` inputs; link has `target="_blank"` and `rel="noopener noreferrer"`; https only with `spec.tls`.
- [x] Routes absent on `prod-k8s-1` nav; direct URL shows the "aren't available" state (existing; one assertion).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: `linkOut.hostUrl` (allow-list, no `new URL`), `routeStatus`/`routeHost`/`routeLabel`,
  `RouteLocation` (OCP `ExternalLinkWithCopy`: PF inline clipboard-copy classes + `ExternalLinkButton` + `ClipboardCopyButton`),
  descriptor columns Name/Namespace/Status/Location/Service + Status filter (OCP `useRouteFilters`). Created column dropped (not in np).
  `nav/useClusterNav.test.tsx`: opens `web-canary` (Service column made `web` ambiguous). Probe: local OCP ref runs without the networking plugin (generic Name/Created list), so the Location cell had no counterpart.
- 2026-11-25 fix round 1: copy tooltip text in `pf-v6-u-text-nowrap` (OCP `co-nowrap`); button `aria-controls` → link text (PF 6 ignores deprecated `textId`).

## Review
- 2026-11-25 ux-designer, round 1: **CHANGES_REQUESTED** (1 finding; everything else matches np `useRouteColumns`/`RouteRow`/`RouteLocation` and `public/components/utils/link.tsx` `ExternalLinkWithCopy`).
  - Routes list Location copy tooltip — "Copy to clipboard" wraps to 2 lines (probe: tooltip 120x52 at 1280) — OCP `link.tsx` L95-99 wraps the tooltip text in `<span className="co-nowrap">` (one line) — wrap the `ClipboardCopyButton` children in `<span className="pf-v6-u-text-nowrap">`.
  - Checked OK: column order/titles and visibility (Status `visibleOnLg`, Location/Service `visibleOnXl`, Namespace only in all-namespaces), kebab column, DOM `pf-v6-c-clipboard-copy pf-m-inline` > `__text` (inline `ExternalLinkButton`, `pf-v6-u-display-inline`, icon `ml-xs`) + `__actions-item` plain `hasNoPadding` button (14x21, `exitDelay` 600/1250, maxWidth 120px), `co-break-word` wrapping, Pending/Rejected/wildcard as plain text, Status icons via shared `Status` (OCP `Status.tsx`).
  - Non-blocking: OCP passes `textId` to `ClipboardCopyButton` (sets `aria-controls`); optional.
- 2026-11-25 frontend-architect, round 1: **APPROVE** (scoped `check-fe.sh` networking + nav: lint/typecheck/46 tests green).
- `hostUrl` matches the contract: the allow-list is checked on the raw strings with no `new URL`; every listed hostile input is tested (plus label length, `..`, leading `-`); `RouteLocation` and `routeWebUrl` are the only callers.
- Copy button: acceptable. PF `ClipboardCopy` children are copy text and can't hold a link, so the hand-built `pf-m-inline` markup is the PF path and mirrors OCP `ExternalLinkWithCopy` 1:1. The direct PF stylesheet import is needed because `base.css` carries no component CSS.
- Status filter matches np `useRouteFilters` (same statuses, same order). Dropping Created is correct (np `useRouteColumns` has no Created column).
- Pending for "no Admitted condition" and `DASH` for no host follow the contract and are recorded in the Handover notes; no change needed.
- Nit (optional): `RouteLocation.tsx:103`: a `writeText` rejection is unhandled (same as `CopyableValue`). Fold into a shared copy hook later if one appears.

## Handover notes
- `hostUrl` in `networking/linkOut.ts` is the only host→href path; Ingress (T-0304) must reuse it.
- `routeStatus` follows this task's contract (no Admitted=True/False → Pending); OCP's plugin says Rejected for an ingress
  with no Admitted condition — edge case only.
- No-host Location renders `DASH` per contract (OCP prints "unknown host").
- Wildcard label: host already starting `*.` is kept as is (our fixture), else first label → `*` (OCP `getSubdomain`).
- The clipboard-copy CSS is imported directly in `RouteLocation.tsx` (only PF `ClipboardCopy` would load it otherwise);
  importing `react-styles/css/.../clipboard-copy(.mjs)` breaks Vitest (node can't load `.css`).
- T-0303 can reuse `RouteLocation`, `routeWebUrl`, `routeHost` for the details page.

- Round 2 (orchestrator, verify-only): nowrap span and aria-controls present (RouteLocation.tsx L50, L60), test asserts aria-controls; gate green 1369/1369. APPROVE.
