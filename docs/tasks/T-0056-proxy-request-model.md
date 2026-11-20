---
id: T-0056
title: Proxy request model — path validation, request-info parser, mutation classifier
status: todo
owner: backend-engineer
checkpoint: 2
depends_on: []
paths: [src/FleetConsole.Application/Proxy/Requests/, tests/FleetConsole.Application.Tests/Proxy/Requests/]
review_rounds: 0
---

## Goal
Pure, framework-free building blocks the proxy decides on: validate the raw forwarded path (PRX-4), parse it into a
Kubernetes request info, classify verb/mutation/watch/streaming (MUT-1, MUT-4) and cap watch `timeoutSeconds` (PRX-8).
Everything later (policies, audit, endpoint) consumes these types. Lane A — parallel with T-0057 and T-0058.

## Scope
- In: the types below + exhaustive table-driven unit tests (QG-2). XML docs on everything public.
- Out: DB access, policies, ASP.NET types (Application has no ASP.NET reference), audit.

## Contract / design notes
ADR-0019 §2–4, ADR-0020 §5 (watch query). Namespace `FleetConsole.Application.Proxy.Requests`.
```csharp
/// Validated, still-encoded path forwarded byte-for-byte (e.g. "/api/v1/namespaces/shop/pods").
public sealed record ProxyPath
{
    public string Value { get; }
    public static bool TryParse(string? rawPath, [NotNullWhen(true)] out ProxyPath? path);
}
public enum KubernetesVerb { Get, List, Watch, Create, Update, Patch, Delete, DeleteCollection, Connect, Other }
public sealed record KubernetesRequestInfo(
    bool IsResourceRequest, string Path, string? Group /* "" = core */, string? Version,
    string? Namespace, string? Resource, string? Subresource, string? Name)
{
    public static KubernetesRequestInfo Parse(ProxyPath path);
    /// kubectl-style: "shop/configmaps/web", "shop/deployments.apps/web/scale", "namespaces/shop", "shop/pods",
    /// non-resource → Path.
    public string DisplayName { get; }
}
public sealed record ProxyRequest(
    string Method, ProxyPath Path, string QueryString /* "" or "?a=b", raw */, KubernetesRequestInfo Info,
    KubernetesVerb Verb, bool IsMutation, bool IsWatch, bool IsStreaming, long? ContentLength,
    string? DryRun, string? FieldManager)
{
    public static ProxyRequest Create(string method, ProxyPath path, string queryString, bool isUpgrade, long? contentLength);
    /// For watches: queryString with timeoutSeconds = min(requested, capSeconds) (added when absent/invalid);
    /// other requests: unchanged. Preserves every other parameter and its encoding/order.
    public string ForwardedQueryString(int watchTimeoutCapSeconds);
}
```
Rules:
- `TryParse` rejects: null/empty; not starting with `/`; any `%2e`/`%2f`/`%5c` (case-insensitive); `\`; `//`; a
  `.` or `..` segment; control chars (< 0x20, 0x7F); `?`/`#` (query is passed separately); first segment not in
  {`api`, `apis`, `version`, `openapi`, `.well-known`} (case-sensitive, segment match: `/apiz` rejected,
  `/api` and `/api/` accepted). It never rewrites.
- Parser (mirror apiserver `RequestInfoFactory`): `/api/<v>/…` core (`Group=""`), `/apis/<g>/<v>/…`; discovery roots
  (`/api`, `/apis`, `/apis/<g>`, `/apis/<g>/<v>`) and `/version`, `/openapi/*`, `/.well-known/*` → non-resource.
  Legacy `/watch/` after the version → `IsWatch`. `namespaces/<ns>/<resource>[/<name>[/<sub>]]`; the namespace
  object `namespaces/<ns>[/status|/finalize]` → `Resource="namespaces"`, `Name=<ns>`, `Namespace=null`.
- Verb: GET/HEAD/OPTIONS → `Get` (named) / `List` / `Watch`; POST → `Create`; PUT → `Update`; PATCH → `Patch`;
  DELETE → `Delete` (named) / `DeleteCollection`; any method on subresource `exec|attach|portforward|proxy` → `Connect`;
  other methods → `Other`.
- `IsMutation`: method not GET/HEAD/OPTIONS, **or** verb `Connect`; **except** POST to collection
  `selfsubjectaccessreviews`/`selfsubjectrulesreviews` in group `authorization.k8s.io`, version `v1`.
- `IsWatch`: `watch=true|1` (query) or legacy `/watch/`. `IsStreaming`: watch, `follow=true`, or `isUpgrade`.
- `DryRun`/`FieldManager`: first value of those query parameters (decoded), else null. Use
  `System.Web.HttpUtility.ParseQueryString` for reading; build `ForwardedQueryString` by editing the raw string so
  untouched parameters keep their exact encoding.

## Context pack
- Docs: ADR-0019 §2–4; BACKEND.md § "Use case folder convention" (L107-131) for naming/visibility; § "Documentation style" (L271-282).
- Exemplar of a pure Application value type with tests: `src/FleetConsole.Application/Audit/ListAuditEntries/AuditCursor.cs` + its test in `tests/FleetConsole.Application.Tests/Audit/ListAuditEntries/`.
- Kubernetes reference (no need to fetch): verbs per apiserver `RequestInfoFactory`; SSAR path
  `/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`.

## Acceptance criteria
- [ ] PRX-4: table test with ≥ 25 cases incl. `/api/v1/pods`, `/apis/apps/v1/namespaces/a/deployments/b/scale`, `/version`, `/openapi/v3`, `/.well-known/openid-configuration` (accepted) and `/`, `/healthz`, `/apiz`, `/api/../x`, `/api/%2e%2e/x`, `/api/v1/%2F`, `/api/v1/%2f`, `//evil.example/api`, `/api\\v1`, `https://x/api`, `/api/v1/./pods`, `/api/v1/pods?x` (rejected).
- [ ] QG-2: parser table covers core vs named group, cluster-scoped, namespaced collection/object/subresource (`pods/eviction`, `pods/log`, `deployments/scale`, `pods/exec`), namespace object + `finalize`, legacy `/watch/`, discovery roots, `DisplayName` for each.
- [ ] MUT-1/4: classifier table: every method × read/connect/SSAR/SSRR (SSAR in another group/version or with a name is a mutation), `dryRun=All` still a mutation, WS upgrade on `exec` is a mutation, GET `pods/log?follow=true` streaming but not a mutation.
- [ ] PRX-8: `ForwardedQueryString` caps (`600`→cap), keeps lower (`60`), adds when absent/garbage, leaves non-watch queries untouched, preserves other params' encoding.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
