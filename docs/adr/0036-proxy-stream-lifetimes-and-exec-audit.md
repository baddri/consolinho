# 0036 — Proxy stream lifetimes, exec session cap and exec audit at handshake
**Status:** Accepted (2026-11-23, CP4a design; Q3/Q4 accepted by the orchestrator) · amends ADR-0020 §5/§7 (watch cap,
idle timeouts) and ADR-0021 §2 (audit written after the response) · spec `docs/specs/CP4-workloads.md` LOG-6/7, TERM-6/7/8

## Context
CP4a adds followed pod logs (`…/pods/<p>/log?follow=true`) and the WebSocket terminal (`…/pods/<p>/exec`). Both already
pass through `KubernetesProxyEndpoint`, but three properties of the CP2 design break for them:
1. **Revocation latency.** Watches end at `timeoutSeconds` ≤ 300 s, so a revoked user's read stream dies within the cap
   (SECURITY §Proxy hardening). Followed logs have no `timeoutSeconds`: they live until the container ends. An exec
   session has no limit at all.
2. **Idle timeouts.** Upgrades get `StreamIdleTimeout` (cap + 30 s = 330 s), so an idle terminal is cut after 5.5 min.
3. **Audit timing.** Proxy audit is written after `IHttpForwarder.SendAsync` returns, which for exec is when the
   session *ends*. If the pod is killed, the replica restarts, or the session runs for an hour, the "who opened a
   shell" record arrives late or never (TERM-7).
Also, the forwarding pool disposes a retired handler 6 min after an admin cluster edit, which cuts any stream still on
it (HANDOVER gotcha, T-0058).

## Decision
1. **Every proxied stream has a hard lifetime, enforced by the endpoint.** Before `SendAsync`, the endpoint links
   `HttpContext.RequestAborted` with a timer (`CancellationTokenSource(lifetime, TimeProvider)`) and assigns the linked
   token to `RequestAborted` (YARP observes it). When it fires, YARP aborts the response or tunnel. This is not an error:
   nothing is logged at Warning or above, and no problem is written.
   - Non-upgrade streams (watch, `follow=true`): lifetime = `StreamIdleTimeout` (watch cap + 30 s). Watches still end
     first via `timeoutSeconds`. Followed logs are cut at 5.5 min, and the SPA resumes with `sinceTime` (LOG-6).
   - Upgrades (exec/attach): lifetime = **`Proxy:ExecSessionCap`**, default **60 min** (whole seconds, ≥ 1 s). YARP's
     `ActivityTimeout` for upgrades is also `ExecSessionCap`, so an idle terminal lives until the cap.
   Reconnecting runs the normal authorization query, so revocation, deactivation and cluster disable take effect at the
   next cap or reconnect (TERM-8).
2. **Pool grace covers the longest stream.** `ClusterForwardingClientPool.RetiredHandlerGracePeriod` =
   `max(StreamIdleTimeout, ExecSessionCap) + 1 min`, from `ProxyOptions`. An admin cluster edit no longer cuts open
   streams. They finish on the old handler, with TLS settings already negotiated, until their own cap. New requests
   use the new handler at once.
3. **Exec is audited at the handshake.** When the upstream answers `101 Switching Protocols`, the transformer calls
   back to the endpoint. The endpoint writes the `proxy.connect` entry (status 101, outcome allowed) *before* any frame
   is relayed. After the session it writes nothing more for that request. Non-101 answers (RBAC 403, 400, 404) keep the
   CP2 path and are audited when `SendAsync` returns. Denials before forwarding are unchanged. A failed audit write is
   logged at Error and does not block the session (ADR-0021 §4). The database already sits on the authorization path,
   so this opens no new fail-open hole.
4. **Session end is a log, not an audit entry.** `ProxyLog.ExecSessionEnded` (Information): cluster, namespace, pod,
   container, duration and end cause (`cap` | `client` | `upstream`), with no query and no command. One entry per
   request stays the audit invariant, and the end time is operational data.
5. **Audit details gain `container`.** For `Connect` verbs this is the first decoded `container` query value, or null.
   It is parsed once in `ProxyRequest`, like `dryRun`. The exec **`command` is never recorded**: users can type
   secrets into it, and the audit log is readable by auditors.
6. **Logs stay HTTP (Q4).** Followed logs use the existing GET path: streamed, flushed headers (T-0090), not audited
   (LOG-9), no Origin or upgrade handling. We found no concrete gap. The HTTP/1.1 limit of six connections per origin
   applies to logs as it does to watches. It is the SPA's concern (bounded watches) and is not a reason to move to
   WebSocket.

## Consequences
- New config key `Proxy:ExecSessionCap` (validated, in `appsettings.json`, CP2 contract §7 and the deploy config contract).
- The SPA must treat a clean EOF **and** an aborted body (fetch reader rejects) on a followed log as "maybe reconnect",
  and a WebSocket close without a close frame (1006) as "session ended" (TERM-3).
- Retired handlers can live up to about 61 min after a cluster edit. The memory cost is small, and pooled idle
  connections are closed by the handler's own idle timeout.
- SECURITY.md §Proxy hardening/§Audit and BACKEND.md §The proxy describe the lifetimes and the exec audit timing.
