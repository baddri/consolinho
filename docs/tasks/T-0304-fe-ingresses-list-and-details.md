---
id: T-0304
title: Ingresses — list and details with Rules and TLS (ING-1, ING-2)
status: todo
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0302]
paths: [web/src/features/resources/registry/kinds/ingresses.tsx, web/src/features/resources/networking/ingresses]
review_rounds: 0
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
- [ ] ING-1: `shop-ingress` row shows first host and "+N"; columns as OCP.
- [ ] ING-2: details show class, load balancer, Rules table (3 rows), TLS hosts + Secret link; hosts are link-outs under RT-2's rules.
- [ ] SAFE5-4: Secret data never requested or rendered (test).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
