---
id: T-0302
title: Routes list — Status, Location link-out, Service (RT-1, RT-2)
status: todo
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
- [ ] RT-1: dev-1 `shop` Routes list shows `web` Accepted with an external link, `pending` Pending, `rejected` Rejected, `wildcard` host as text.
- [ ] RT-2: `hostUrl` unit tests incl. `javascript:` and `//evil` inputs; link has `target="_blank"` and `rel="noopener noreferrer"`; https only with `spec.tls`.
- [ ] Routes absent on `prod-k8s-1` nav; direct URL shows the "aren't available" state (existing; one assertion).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
