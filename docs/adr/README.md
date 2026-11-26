# Architecture Decision Records

One file per decision: `NNNN-kebab-title.md` with sections **Status** (Proposed/Accepted/Superseded by NNNN),
**Context**, **Decision**, **Consequences**. Architect agents write them; the orchestrator links them from task files.
Never edit an accepted ADR's decision — supersede it.

| # | Title | Status |
|---|---|---|
| 0001 | Technology stack | Accepted |
| 0002 | In-house CQRS dispatcher with pipeline behaviors | Accepted |
| 0003 | YARP IHttpForwarder for the Kubernetes proxy | Accepted |
| 0004 | SA token encryption with ASP.NET Data Protection | Accepted |
| 0005 | Local accounts + cookie sessions; OIDC later | Superseded by 0007 |
| 0006 | Single container serves API and SPA | Accepted |
| 0007 | Login via host cluster OpenShift OAuth | Accepted |
| 0008 | Audit entries in the same transaction via pre-commit domain event handlers | Accepted |
| 0009 | Cookie session revalidation, security stamp, and admin role sources | Accepted |
| 0010 | OpenShift OAuth handler wiring and the DevOAuth emulator | Accepted |
| 0011 | Connection test: step orchestration and capability probing | Accepted |
| 0012 | CSRF header check as middleware; the anonymous API surface | Accepted |
| 0013 | HTTP API conventions (resources, concurrency, enums, pagination) | Accepted |
| 0014 | SPA session handling, route guards and permission-aware UI | Accepted |
| 0015 | Forms, server validation errors, version conflicts and mutation feedback | Accepted |
| 0016 | Contract-first API types and an MSW mock backend for frontend work | Accepted |
| 0017 | Promote always records the admin assignment (refines 0009) | Accepted |
| 0018 | OpenShift OAuth handler: live endpoints, configured redirect URI, classified token exchange (refines 0010) | Accepted |
| 0019 | Proxy request pipeline: raw-path validation, one authorization query, ordered policies | Accepted |
| 0020 | Proxy forwarding: per-cluster invoker pool, header transforms, streaming watches, timeouts, error mapping | Accepted |
| 0021 | Proxy mutation audit: written after the response, in its own unit of work | Accepted |
| 0022 | Kubernetes data layer: list + watch in TanStack Query, error mapping, access checks | Accepted |
| 0023 | Resource registry, OCP-shaped routes and generic resource pages | Accepted |
| 0024 | YAML editor: PatternFly CodeEditor with a bundled, lazy-loaded Monaco | Accepted |
| 0025 | Upgrade Aspire 13.6.5 → 17.0.0 (Microsoft.NET.Sdk AppHost, AddDotnetProject) | Accepted |
| 0026 | Container image: UBI 9 .NET 10 (ASP.NET) runtime, three-stage Containerfile, in-cluster binary build (amends 0006) | Accepted |
| 0027 | Schema migrations: the Api image's `migrate` mode as an init container | Accepted |
| 0028 | Production hosting behind an edge Route: SPA fallback, probes, no forwarded headers, safe logs, fail-fast config | Accepted |
| 0029 | HTTP security headers and the Content-Security-Policy | Accepted |
| 0030 | OpenShift manifests (kustomize), configuration contract and the dev deploy script | Accepted |
| 0031 | OCP page building blocks composed from react-core, not `@patternfly/react-component-groups` | Accepted |
| 0032 | Cluster distribution is presentation; capabilities come from API discovery | Accepted |
| 0033 | Fleet perspective: `/fleet/admin/*` routes, URL-derived perspective, per-distribution shell theme | Accepted |
| 0034 | Group grants and grant precedence (decision; CP4.5) | Accepted |
| 0035 | Access cache: FusionCache behind HybridCache, Redis L2 + backplane (decision; CP4.5) | Accepted |
| 0036 | Proxy stream lifetimes, exec session cap (60 min) and exec audit at the handshake (amends 0020/0021) | Accepted |
| 0037 | Frontend: workload actions (JSON Patch, kind actions), pod log streaming (fetch) and the xterm terminal | Accepted |
| 0038 | Frontend: cluster OpenAPI v3 schema (lazy per group-version, per-cluster cache, monaco-yaml, field help) | Accepted |
| 0039 | Host group membership via FleetConsole host SA snapshot; revalidation fails closed (refines 0034, extends 0009; CP4.5) | Accepted |
| 0040 | Access cache implementation: post-commit event stage, `IQueryCache` port, per-user access snapshot, Redis deploy (amends 0035, implements 0008 §6; CP4.5b) | Accepted |
| 0041 | Fleet status: on-demand probes with the grant credential, NDJSON stream `GET /api/fleet/status`, per-(cluster, credential) cache (CP5c) | Accepted |
| 0042 | Client IP from trusted forwarded headers; login (per IP, before auth) and proxy-mutation (per user) rate limits (amends 0028 §3; CP6a) | Accepted |
| 0043 | Own metrics: Prometheus scrape on a management port, bounded labels, health-as-metrics, monitoring component (CP6a) | Accepted |
| 0044 | Server-side discovery cache in the proxy keyed by cluster + credential + Accept, memory only, tag-invalidated (amends 0020; CP6a) | Accepted |
