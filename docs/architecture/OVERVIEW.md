# Architecture overview

## What the system does

```
 Browser (PatternFly SPA)
   │  cookie session (HttpOnly, SameSite=Strict) + X-Console-Request header
   ▼
 FleetConsole.Api  (one container, hosted on an OpenShift cluster)
   ├── /api/auth/*            login / logout / me
   ├── /api/admin/*           users, clusters, SA credentials, grants, audit  (CQRS, Admin role)
   ├── /api/clusters          clusters the current user may use (for the switcher)
   ├── /api/clusters/{cluster}/k8s/{**path}   ──► Kubernetes/OpenShift API server of {cluster}
   │        resolve grant → policies (mutation guard, audit, …) → strip client auth → add Bearer <SA token> → stream
   └── /*                     built SPA (static files, index.html fallback)
   │
   ├── PostgreSQL: users, clusters, encrypted SA tokens, grants, audit log, Data Protection keys
   └── 40 × OpenShift API servers (https://api.<cluster>:6443)
```

## Core concepts (ubiquitous language)

| Term | Meaning |
|---|---|
| **User** | A FleetConsole login. Role `Admin` or `User`. Can be globally read-only. |
| **Cluster** | A registered OpenShift cluster: slug name (used in URLs), display name, API URL, CA bundle, environment tag (prod/staging/dev…) |
| **Credential** | A ServiceAccount token for one cluster, stored encrypted. Write-only: never returned to any client after save. Can be shared by many users. |
| **Grant** | Links a User to a Cluster through a Credential, with an **AccessMode** (`ReadOnly` / `ReadWrite`). At most one grant per (user, cluster). |
| **Proxy request** | A Kubernetes API call made by the SPA through `/api/clusters/{cluster}/k8s/...`. |
| **Proxy policy** | An ordered, pluggable check/transform applied to every proxy request (e.g. MutationGuard, Audit). |
| **Mutation** | Any proxy request that can change cluster state: POST/PUT/PATCH/DELETE, and exec/attach/portforward even over GET+WebSocket. Some POSTs are reads (SelfSubjectAccessReview, SelfSubjectRulesReview, TokenReview-free checks) and are allow-listed. |
| **Audit entry** | Append-only record of admin actions and proxy mutations (who, cluster, verb, path, status, time). |

## Request flow: proxy

1. Auth middleware authenticates the cookie → `CurrentUser`.
2. Endpoint asks the Application layer `ResolveClusterAccessQuery(user, clusterSlug)` → cluster endpoint + TLS settings,
   decrypted token, access mode. (Cache-friendly; see BACKEND.md "Adding a cache".)
3. A `ProxyRequestContext` is built and run through the ordered `IProxyPolicy` chain. Any policy may **deny**
   (→ 403 ProblemDetails with a reason the UI can show) or annotate the request (audit).
4. Request transform: drop `Cookie`, `Authorization`, all `Impersonate-*` headers and hop-by-hop headers from the
   client; set `Authorization: Bearer <token>`; rewrite path to `{apiServer}/{path}`.
5. `IHttpForwarder` streams request/response (watch streams and logs are never buffered; WebSockets are upgraded).
6. Post-response policies run (audit records status code).

Per-cluster `HttpMessageInvoker`s are cached (one `SocketsHttpHandler` per cluster with its own CA validation) and
rebuilt when the cluster's connection settings change.

## Deployment

- One container image (`deploy/Containerfile`): .NET Api + `web/dist` copied to `wwwroot`.
- OpenShift manifests via kustomize in `deploy/` (Deployment, Service, Route with edge TLS, Secret refs, NetworkPolicy).
- Postgres: external/managed or in-cluster (configurable connection string).
- Data Protection keys persisted in Postgres and protected by a key-encryption certificate/secret in production.
- Locally everything runs via `aspire run`.

## Decisions

See `docs/adr/`. Start with ADR-0001 (stack) through ADR-0006.
