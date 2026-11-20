---
id: T-0059
title: Proxy authorization query, policy chain (mutation guard, body limit), proxy errors and options
status: todo
owner: backend-engineer
checkpoint: 2
depends_on: [T-0056]
paths: [src/FleetConsole.Application/Proxy/AuthorizeProxyRequest/, src/FleetConsole.Application/Proxy/Policies/, src/FleetConsole.Application/Proxy/*.cs, src/FleetConsole.Application/DependencyInjection.cs, src/FleetConsole.Application/Grants/BulkGrant/BulkGrantHandler.cs, tests/FleetConsole.Application.Tests/Proxy/]
review_rounds: 0
---

## Goal
One query answers "may this user send this request to this cluster, and with which endpoint/token?" (PRX-2/3, MUT-2/3/5),
evaluated per request with no cache (Q11), through an ordered `IProxyPolicy` chain so future rules are just new policies
(ADR-0019 §5–8). Lane A after T-0056; parallel with T-0060 (disjoint folders: don't touch `Proxy/RecordProxyAudit/` or
`Proxy/Requests/`).

## Scope
- In: types below, policies, errors, options class (binding happens in the Api, T-0061), DI helper, unit tests.
- Folded CP1 nit (T-0019): `BulkGrantHandler.cs:L97-104` — make the final `else` an explicit
  `else if (code == GrantErrors.AlreadyExists(...).Code)` and throw `UnreachableException` for anything else.
- Out: HTTP, forwarding, audit.

## Contract / design notes
Namespace `FleetConsole.Application.Proxy` (+ `.AuthorizeProxyRequest`, `.Policies`).
```csharp
public sealed record AuthorizeProxyRequestQuery(string ClusterName, ProxyRequest Request)
    : IQuery<ProxyTarget>, IRequireAuthenticated;
public sealed record ProxyTarget(ClusterId ClusterId, string ClusterName, ClusterConnection Connection, SensitiveString Token);
public sealed record ProxyRequestContext(UserId UserId, string Username, string ClusterName,
    ClusterEnvironment Environment, AccessMode GrantMode, bool UserIsReadOnly, ProxyRequest Request);
public interface IProxyPolicy { ValueTask<Result> EvaluateAsync(ProxyRequestContext context, CancellationToken ct); }
public static class ProxyPolicyServiceCollectionExtensions
{ public static IServiceCollection AddProxyPolicy<TPolicy>(this IServiceCollection s) where TPolicy : class, IProxyPolicy; } // scoped, order = registration
internal sealed class MutationGuardPolicy : IProxyPolicy      // mutation && UserIsReadOnly → UserReadOnly; mutation && GrantMode==ReadOnly → ReadOnlyGrant
internal sealed class RequestBodyLimitPolicy(IOptions<ProxyOptions>) : IProxyPolicy // mutation && ContentLength > Max → BodyTooLarge
public sealed class ProxyOptions   // section "Proxy"
{ public const string SectionName = "Proxy";
  public TimeSpan RequestTimeout { get; set; } = 30 s; public TimeSpan WatchTimeoutCap { get; set; } = 5 min;
  public long MaxMutationBodyBytes { get; set; } = 10 MiB;
  public TimeSpan StreamIdleTimeout => WatchTimeoutCap + 30 s; public int WatchTimeoutCapSeconds => (int)WatchTimeoutCap.TotalSeconds; }
public static class ProxyErrors   // codes + factories; messages exactly as docs/specs/CP2-api-contract.md §4
{ NotAvailable(string cluster) /*NotFound*/, UserReadOnly /*Forbidden*/, ReadOnlyGrant(string cluster) /*Forbidden*/,
  BodyTooLarge(long limitBytes) /*Failure*/, PathNotAllowed /*Validation code, plain Error*/, OriginNotAllowed /*Forbidden*/,
  CredentialRejected(string cluster), UpstreamUnavailable(string cluster), UpstreamTls(string cluster) /*Failure*/,
  UpstreamTimeout(string cluster) /*Failure*/ }   // Api maps code → status (T-0061)
```
Handler rules:
- `ClusterName.Create(request.ClusterName)` fails → `NotAvailable` with a generic name-free message variant (don't echo junk).
- **One SQL statement** over `IReadModel`: grants ⋈ users (`!IsDeactivated`) ⋈ clusters (`IsEnabled`, by name) ⋈
  credentials (by `grant.CredentialId`), current user's id, projecting endpoint URL, CA PEM, skip flag, environment,
  grant mode, `u.IsReadOnly`, `u.Username`, encrypted token. No row → `NotAvailable`. Then `ITokenProtector.Unprotect`.
- `UserIsReadOnly = row.UserIsReadOnly || currentUser.IsReadOnly`.
- Run policies in order; first failure is returned. Success → `ProxyTarget`.
- Register in `AddApplication()`: `AddProxyPolicy<MutationGuardPolicy>()` then `AddProxyPolicy<RequestBodyLimitPolicy>()`
  (order is the MUT-3 "user before grant" + 413-last contract). Doc-comment the ordering at the registration.
- Do **not** mark the query `IMutatingCommand`/command: it has no side effects; `LoggingBehavior` logs the query type,
  never the token (`SensitiveString`).

## Context pack
- Docs: ADR-0019 §1, §5–8; BACKEND.md § "The proxy" (L184-205, being updated in this design), § "Recipes / Blocking a class of operations" (L215-217).
- Single-SQL join exemplar: `src/FleetConsole.Application/Clusters/ListAccessibleClusters/ListAccessibleClustersHandler.cs:L19-55` (copy the join + stricter read-only rule).
- Token decrypt exemplar: `src/FleetConsole.Application/Credentials/TestCredential/TestCredentialHandler.cs:L48`; `ConnectionTester.ConnectionOf` (`Credentials/ConnectionTesting/ConnectionTester.cs:L59-63`) for building `ClusterConnection`.
- Error catalogue exemplar: `src/FleetConsole.Application/Abstractions/AuthErrors.cs`.
- DI: `src/FleetConsole.Application/DependencyInjection.cs:L43-52`.
- Test fakes: `tests/FleetConsole.Application.Tests/FakeCurrentUser.cs`, `Clusters/ClusterFakes.cs` (in-memory read model pattern).

## Acceptance criteria
- [ ] PRX-2: handler tests — unknown cluster, disabled cluster, no grant, deactivated user, missing credential, malformed name all → `Proxy.NotAvailable` with identical message for the valid-name cases; valid → `ProxyTarget` with decrypted token and the cluster's `ClusterConnection`.
- [ ] MUT-2/3: policy table — {GET, PUT, DELETE, SSAR POST, exec} × {ReadOnly, ReadWrite} × {user read-only, not}; user read-only wins over ReadOnly grant; session read-only alone also denies.
- [ ] MUT-5: `RequestBodyLimitPolicy` — over limit → `Proxy.BodyTooLarge`; at limit / unknown length / non-mutation → success.
- [ ] Policies run in registration order (test with two recording fake policies through the handler).
- [ ] BulkGrant nit done; its tests still green.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
