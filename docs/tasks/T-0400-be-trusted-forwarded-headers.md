---
id: T-0400
title: Honour X-Forwarded-For/-Proto only from trusted networks; keep them off upstream
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: []
paths: [src/FleetConsole.Api/Hosting, src/FleetConsole.Api/Program.cs, src/FleetConsole.Api/Proxy/KubernetesRequestTransformer.cs, src/FleetConsole.Api/appsettings.json, tests/FleetConsole.Api.Tests, deploy/kustomize/base/kustomization.yaml, scripts/deploy-dev.sh, docs/architecture/BACKEND.md, docs/architecture/SECURITY.md, docs/adr/0028-production-hosting-behind-edge-route.md, docs/ops/RUNBOOK.md]
review_rounds: 0
size: S (0.5 d)
---

## Goal
Audit and per-IP login limits need the real client IP (spec CP6a FWD-1, FWD-3). Trust `X-Forwarded-*` only from the
configured router networks, take only the hop the router appended, and never leak forwarded headers to clusters.

## Scope
- In: `ForwardedHeadersSetup` (options + start validation), pipeline wiring, transformer strips `X-Original-*`,
  config in base manifests + `deploy-dev.sh` live derivation, docs.
- Out: audit column (T-0401), rate limits (T-0402/T-0403).

## Contract / design notes
ADR-0042 §1–2.
- New `src/FleetConsole.Api/Hosting/ForwardedHeadersSetup.cs`: `AddTrustedForwardedHeaders(this WebApplicationBuilder)`
  binds `ForwardedHeaders:KnownNetworks` (string[] CIDR) and `ForwardedHeaders:KnownProxies` (string[] IP);
  `ForwardedHeadersOptions`: `XForwardedFor | XForwardedProto`, `ForwardLimit = 1`, **clear** the default
  `KnownNetworks`/`KnownProxies` (loopback) first, then add configured entries. Invalid entry → `ValidateOnStart`
  failure naming the key and index (e.g. `ForwardedHeaders:KnownNetworks:1 is not a CIDR`) — same pattern as other
  validators (ADR-0028 §6). Empty = trust nobody.
- `Program.cs`: `app.UseForwardedHeaders()` as the **first** middleware (before `UseExceptionHandler`), comment why.
- `KubernetesRequestTransformer.StrippedPrefixes` (L53) += `"X-Original-"` and update the class XML doc list (L20-21)
  and SECURITY.md § Proxy hardening list.
- Manifests: base ConfigMap literal `ForwardedHeaders__KnownNetworks__0=10.128.0.0/14` (OpenShift default cluster
  network); `deploy-dev.sh` overrides from `oc get network.config/cluster -o jsonpath='{.spec.clusterNetwork[*].cidr}'`
  plus `{.status...}` machine network when available (routers may be HostNetwork → node IPs). Derive live, never hardcode
  consolinho values.
- Docs: ADR-0028 §3 gets "Amended by ADR-0042"; BACKEND.md § Hosting bullet "trusts no forwarded headers" rewritten;
  RUNBOOK §5 config reference + a "Trusted networks (XFF)" subsection (how to find CIDRs, symptom when wrong: audit shows
  router IPs / all logins share one limit).

## Context pack
- Docs: ADR-0042 (whole, short), ADR-0028 §3, SECURITY.md § Proxy hardening (L90-110).
- Exemplar validator: `src/FleetConsole.Api/Hosting/PublicOriginOptions.cs` (options + validate on start).
- Touch points: `src/FleetConsole.Api/Program.cs` (pipeline L68-80), `KubernetesRequestTransformer.cs:StrippedPrefixes` L53.
- Tests: copy host setup from an existing `tests/FleetConsole.Api.Tests/Integration` test using `ApiFactory`; for
  remote IP use TestServer's `HttpContext.Connection.RemoteIpAddress` via a `startup filter`/`TestServer` `
  .SendAsync(ctx => ctx.Connection.RemoteIpAddress = ...)`. Transformer tests: `tests/FleetConsole.Api.Tests/Proxy/*Transformer*`.

## Acceptance criteria
- [ ] FWD-1: XFF from a trusted network sets `RemoteIpAddress` to the router-appended hop; from an untrusted peer it is
      ignored; a client-forged left-most XFF entry is ignored with a trusted peer (ForwardLimit 1). Tests for each.
- [ ] Invalid CIDR fails start naming the key; empty config = no trust (test).
- [ ] FWD-3: `X-Forwarded-*`, `Forwarded`, `X-Original-*` never reach the upstream (transformer test).
- [ ] Docs above updated; build + tests green (`scripts/check-be.sh`).

## Work log

## Review

## Handover notes
