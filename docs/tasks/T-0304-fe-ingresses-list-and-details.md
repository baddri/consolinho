---
id: T-0304
title: Ingresses — list and details with Rules and TLS (ING-1, ING-2)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0302]
paths: [web/src/features/resources/registry/kinds/ingresses.tsx, web/src/features/resources/networking/ingresses]
review_rounds: 1
---

## Goal
Ingresses read like OCP's networking plugin: hosts in the list, rules and TLS on the details page, hosts as safe
link-outs, so connectivity can be debugged without YAML.

## Scope
- In: list columns, details right column, Rules and TLS sections.
- Out: Ingress form; IngressClass pages.

## Contract / design notes
- **List** (*(np)* `ingresses/list/IngressesList.tsx` + its hooks): Name, Namespace, Labels (`labelsColumn`), Host
  (first rule host, then " +N" when more — match OCP's rendering in the np list utils), Created (`ageColumn`).
- **Right column** (`networking/ingresses/IngressDetails.tsx`): Ingress class (`spec.ingressClassName`, else the
  `kubernetes.io/ingress.class` annotation), Load balancer (`status.loadBalancer.ingress[].hostname|ip`), plus any
  rows *(np)* `tabs/details/IngressDetailsTab.tsx` shows — copy its labels.
- **Rules** (`DetailsSubsection` "Rules", compact `Table`): Host · Path · Path type · Service · Service port, one row per
  `rules[].http.paths[]`; Host is a link-out via `hostUrl({ host, path, tls: hostInTls })` from `networking/linkOut.ts`
  (T-0302) rendered with the same `ExternalLinkButton` as `RouteLocation`, text when `hostUrl` is undefined (wildcards);
  Service → `ResourceLink` (SVC); port = `number` or `name`. Default backend row if `spec.defaultBackend` (as OCP).
- **TLS** (`DetailsSubsection` "TLS"): Hosts · Secret name (`ResourceLink` to the Secret, S badge). SAFE5-4: only the
  name — never fetch or render the Secret.
- Tests in `networking/ingresses/ingresses.test.tsx`: list Host "+N", rules rows, TLS secret link, no secret data
  fetched (assert no GET on `secrets/shop-tls` via MSW request log or spy).

## Context pack
- Exemplars: `registry/kinds/services.tsx:PortsTable` (compact table), `registry/kinds/jobs.tsx` (descriptor wiring).
- Touch points: `registry/kinds/ingresses.tsx:ingressDescriptor` (minimal, T-0300); `networking/linkOut.ts:hostUrl`,
  `networking/routes/RouteLocation.tsx` (link rendering to reuse — extract a tiny `HostLink` there if both need it;
  T-0302/T-0303 are done by then, same lane).
- OCP reference: *(np)* `src/views/ingresses/list/IngressesList.tsx` (+ `hooks/`, `utils/`),
  `src/views/ingresses/details/tabs/details/IngressDetailsTab.tsx` (+ `components/`, `utils/`).

## Acceptance criteria
- [x] ING-1: `shop-ingress` row shows every host comma-joined (truncated, full list on hover); columns as OCP.
- [x] ING-2: details show class, load balancer, Rules table (3 rows), TLS hosts + Secret link; hosts are link-outs under RT-2's rules.
- [x] SAFE5-4: Secret data never requested or rendered (test).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: started; OCP ref fetched from openshift/networking-console-plugin (not in local clone).
- 2026-11-25: `networking/ingresses/{ingressRules.ts,IngressDetails.tsx,ingresses.test.tsx}`, descriptor wired (Hosts, Labels).
- 2026-11-25: check-fe networking green; full gate: lint/typecheck/build ok, 1 failure in `mocks/k8s.test.ts` from
  shared/k8s WIP (extra `machine.openshift.io` group), not this task. ui-probe: OCP ref cluster has no Ingresses.
- 2026-11-25 fix round 1: Hosts comma-joined + truncate (no "+N", spec ING-1 updated), Rules/TLS tables default variant, Labels md / Hosts lg, wildcard TLS hosts -> https.

## Review
- 2026-11-25 ux-designer, round 1: **CHANGES_REQUESTED** (np = openshift/networking-console-plugin `src/`; probe mock 1280 light, ours-only)
- Ingress list Hosts cell — first host + " +N" ("shop.example.com +1"); OCP shows every host comma-joined on one truncated line (np `views/ingresses/list/components/IngressTableRow.tsx` + `utils/components/HostData/HostDetails.tsx`: `co-truncate co-select-to-copy`, `title`=list; `list/utils/utils.ts:getHostsStr`) — render `ingressHosts().join(', ')` with `pf-v6-u-text-truncate` + `title`, keep subtle "No hosts"; drop `hostsSummary`, update the ING-1 test/AC wording (spec ING-1 "+N" conflicts with its own "match OCP"; parity wins, per CLAUDE.md north star).
- Ingress details Rules + TLS tables — `variant="compact"` (td padding 8px 16px, th 12px 16px 8px); OCP Rules is a default `Table gridBreakPoint=""` (np `details/tabs/details/components/IngressRulesSection/IngressRulesSection.tsx`), and the approved Route details sibling measures 16px td/th — drop `compact` on both tables; add `gridBreakPoint=""` on Rules as OCP.
- Ingress list column visibility — Labels `visibleOnLg`, Hosts `visibleOnXl`; OCP reuses services `tableColumnClasses` [2]=`visible-on-md`, [3]=`visible-on-lg` (np `views/services/list/hooks/useServiceColumn.tsx`) — set Labels `['hidden','visibleOnMd']`, Hosts `['hidden','visibleOnLg']` (no change visible at 1280/1920).
- Accepted deviations: "TLS certificate" row is OCP's (np `IngressDetailsSection/TLSCert.tsx`; OCP prints names after one Secret icon, our per-Secret `ResourceLink` is fine, "Not configured" copy matches); Host link-out without copy button is fine (OCP shows plain text in this cell, RT-2 asks for the link, a copy button does not belong in a table cell); right column (class, load balancer) and TLS section are spec additions (OCP has `Grid span=6` only) in OCP style, "TLS is not enabled." matches Route details.
- OK: explanation text subtle + 24px margin = OCP `co-m-pane__explanation` (`public/style/_common.scss:63`); section h2 20px/600 + 16px gap same as Route details; "No Rules found" EmptyBox copy; `*` for empty host/path; DASH for missing port/service as np `RulesRow.tsx`.
- 2026-11-25 frontend-architect, round 1: **APPROVE**. `check-fe.sh src/features/resources/networking` green (44 tests).
  Deviations accepted, all match networking-plugin: no Created column and "Hosts" header (`useIngressColumns`); "Ingress
  rules" title and explanation copy; first host + " +N" with the full list in `title` (AC wording); "TLS certificate" row (`TLSCert`).
  SAFE: the only external href (`IngressDetails.tsx:141`) comes from `hostUrl`; Secrets are linked by name only, and the test asserts no `/secrets` request.
  HostLink: no follow-up now. The two call sites share about 8 lines of `ExternalLinkButton` props. Extract `HostLink` in `networking/` when a third caller appears.
  Nits (optional): `ingressRules.ts:61` exact-match TLS hosts, so a host covered by a wildcard `*.example.com` TLS entry links as http;
  `IngressDetails.tsx:107` renders an empty value when `spec.tls` has entries without `secretName` (OCP does the same).

## Handover notes
- Columns follow OCP `useIngressColumns`: Name, Namespace, Labels, Hosts. **No Created column** (OCP has
  none); header "Hosts" (OCP). Cell = all hosts comma-joined, `pf-v6-u-text-truncate` + `title` (OCP); "No hosts" subtle. Labels >= md, Hosts >= lg.
- Metadata column gets OCP's "TLS certificate" row (Secret links or "Not configured"); right column: Ingress class
  (spec, else legacy annotation), Load balancer (hostname|ip per line).
- Sections: "Ingress rules" (OCP title + explanation copy, default table `gridBreakPoint=""`, OCP column visibilities; `*` for empty
  host/path; rules without paths -> defaultBackend; defaultBackend only -> one `*` row; else "No Rules found"), then "TLS".
- Host link: `ExternalLinkButton` styled like RouteLocation (no copy button, table cell); href only via `hostUrl`,
  https when a `spec.tls[].hosts` entry covers the host (exact or one-label `*.` wildcard). RouteLocation untouched (outside paths), so no shared `HostLink` extracted.
- SAFE5-4 test asserts no request path containing `/secrets` and no PEM markers in the DOM.
- Round 2 (orchestrator verify): hosts comma-joined, default tables, md/lg breakpoints, wildcard TLS https; ingress tests green. APPROVED.
