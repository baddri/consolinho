---
id: T-0056
title: Proxy request model — path validation, request-info parser, mutation classifier
status: done
owner: backend-engineer
checkpoint: 2
depends_on: []
paths: [src/FleetConsole.Application/Proxy/Requests/, tests/FleetConsole.Application.Tests/Proxy/Requests/]
review_rounds: 1
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
- [x] PRX-4: table test with ≥ 25 cases incl. `/api/v1/pods`, `/apis/apps/v1/namespaces/a/deployments/b/scale`, `/version`, `/openapi/v3`, `/.well-known/openid-configuration` (accepted) and `/`, `/healthz`, `/apiz`, `/api/../x`, `/api/%2e%2e/x`, `/api/v1/%2F`, `/api/v1/%2f`, `//evil.example/api`, `/api\\v1`, `https://x/api`, `/api/v1/./pods`, `/api/v1/pods?x` (rejected).
- [x] QG-2: parser table covers core vs named group, cluster-scoped, namespaced collection/object/subresource (`pods/eviction`, `pods/log`, `deployments/scale`, `pods/exec`), namespace object + `finalize`, legacy `/watch/`, discovery roots, `DisplayName` for each.
- [x] MUT-1/4: classifier table: every method × read/connect/SSAR/SSRR (SSAR in another group/version or with a name is a mutation), `dryRun=All` still a mutation, WS upgrade on `exec` is a mutation, GET `pods/log?follow=true` streaming but not a mutation.
- [x] PRX-8: `ForwardedQueryString` caps (`600`→cap), keeps lower (`60`), adds when absent/garbage, leaves non-watch queries untouched, preserves other params' encoding.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 backend-engineer: started; worktree fast-forwarded main → cp/2-proxy-browser (was created from main).

- 2026-11-20 backend-engineer: ProxyPath, KubernetesVerb, KubernetesRequestInfo, ProxyRequest + 3 table-test classes
  (164 cases). Classification lives in `ProxyRequest.Create` (task contract) rather than a separate
  `ProxyRequestClassifier` (ADR-0019 §4 name). check-be.sh green (incl. Testcontainers via podman).
- 2026-11-20 backend-engineer: review round 1 fixed — segments decoded (`Uri.UnescapeDataString`) before
  classification; `ProxyPath` rejects malformed and control-char escapes; new internal `KubernetesQuery` mirrors Go
  `ParseQuery` (case-sensitive keys, `;`/malformed pairs skipped). 214 proxy tests; check-be.sh green.

## Review
**CHANGES_REQUESTED** (backend-architect, round 1). check-be.sh green. Structure, docs, tests and the other
classification rules (case, `//`, `..`, `%2e/%2f/%5c`, lowercase methods, dryRun, SSAR scope, legacy proxy) are good.
1. src/FleetConsole.Application/Proxy/Requests/KubernetesRequestInfo.cs:64 — **security, critical**: segments are compared
   still-encoded, but the apiserver routes on the decoded `URL.Path`. Verified: `GET …/pods/b/%65xec` + upgrade →
   `Get`, `IsMutation=false` (exec smuggled as a read); `GET …/services/s/%70roxy/admin` → `Get` (proxy as read); same
   for `%77atch`, `namespaces`, SSAR names etc. — decode each segment (`Uri.UnescapeDataString`, not `UrlDecode`: no
   `+`→space) before parsing so Group/Version/Namespace/Resource/Subresource/Name/DisplayName hold the decoded values
   the apiserver sees; keep `ProxyPath.Value` raw for forwarding. Add tests: `%65xec`, `%45xec`(case), `%70roxy`,
   `%77atch`, `n%61mespaces`, `%3A` name decoded in DisplayName. Update Handover note "segments stay percent-encoded".
2. src/FleetConsole.Application/Proxy/Requests/ProxyPath.cs:42 — malformed escapes (`%`, `%z1`, `%4`) pass and would be
   classified differently from what upstream does (Go rejects with 400) — reject any `%` not followed by two hex digits;
   add cases to the PRX-4 table.
3. src/FleetConsole.Application/Proxy/Requests/ProxyRequest.cs:73,174 — `HttpUtility.ParseQueryString` returns a
   **case-insensitive** collection; Go `url.Values` is case-sensitive. Verified: `?Watch=0&watch=1` → `IsWatch=false`
   while the apiserver opens a watch → PRX-8 cap skipped (watch outlives revocation); `?WATCH=1` falsely a watch. Look up
   keys ordinally (e.g. iterate `AllKeys`/`GetValues` filtered with `string.Equals(key, name, Ordinal)`, or parse pairs
   yourself as `ForwardedQueryString` already does); same for `follow`, `dryRun`, `fieldManager`. Add tests for both.
4. Optional: ADR-0019 §2/§4 amended by the reviewer (decoded-segment classification, case-sensitive query, classifier
   lives in `ProxyRequest.Create`) — no further ADR work needed.

**APPROVE** (backend-architect, round 2). Findings 1–3 fixed with the requested regression tests; check-be.sh green
(323/616/612). Re-probed: `%65xec`/`exe%63`+upgrade and `%70roxy` → Connect/mutation; `?Watch=0&watch=1` → watch with
cap; `?WATCH=1` → list; `a%`/`a%4` rejected. `timeoutSeconds=%zz` + appended cap is correct: Go `parseQuery` skips a
pair whose unescape fails (`continue`, error kept) and `URL.Query()` discards that error, so the apiserver sees only
the appended cap. Encoded control-char rejection in `ProxyPath` is a welcome tightening.

## Handover notes
- `KubernetesRequestInfo` fields and `DisplayName` hold **decoded** segments (what the apiserver routes on); only
  `Info.Path`/`ProxyPath.Value` stay raw for forwarding. `ProxyPath` also rejects `%XX` < 0x20 and `%7F`.
- Additions beyond contract: internal `IsLegacyWatch`/`IsLegacyProxy` on the info; legacy `/api/v1/proxy/...` prefix →
  `Connect` (mutation) so it can never pass as a read. `/api/<v>` (no resource) is non-resource like `/apis/<g>/<v>`.
- Query reading = `KubernetesQuery` (Go `url.ParseQuery` semantics: case-sensitive keys, first value wins, `+`→space,
  pairs with `;` or bad escapes ignored). watch/follow truthiness mirrors Go `strconv.ParseBool`.
- Lowercase/unknown HTTP methods → `Other`, mutation. Non-resource paths: GET → `Get`, DELETE → `Delete` (not collection).
- Self-review read exception also requires no namespace/name/subresource (cluster-scoped collection only).
- `ForwardedQueryString`: `timeoutSeconds` ≤ 0 or non-integer → cap; first occurrence replaced in place, duplicates
  dropped; cap must be > 0 (throws otherwise). `Create` throws if query is non-empty and lacks leading `?`.
