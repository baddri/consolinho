# 0037 — Frontend: workload actions, pod log streaming and the terminal
**Status:** Accepted (2026-11-23, CP4a design; Q3/Q4/Q6 accepted by the orchestrator) · extends ADR-0022 (k8s data
layer), ADR-0023 (registry); pairs with ADR-0036 (proxy stream lifetimes) · spec `docs/specs/CP4-workloads.md` §4a

## Context
CP4a adds the first writes beyond Edit YAML/Delete (labels, annotations, scale, rollout, rollback), the first
non-watch stream (followed pod logs) and the first WebSocket (exec). The registry has fixed tabs and two generic
actions; `shared/k8s` has no PATCH and no subresources; the DOM rule allows only focus delegation. FRONTEND.md planned
a `features/workloads` folder, but its components need `features/resources` internals (paths, access, modal shell)
while the registry in `features/resources` needs them back — a cycle the boundary rule forbids.

## Decision
1. **Kind extras live inside the engine:** `features/resources/workloads/{logs,terminal,pods,deployments,replicasets}`.
   Registry kinds import them relatively; no new feature, no cycle. Generic, kind-free pieces go to `shared/`
   (`shared/k8s/logStream.ts`, `shared/k8s/exec.ts`, `shared/ui/terminal/XTerm.tsx`).
2. **Tabs:** `RESOURCE_TABS` becomes the merged OCP order `details, yaml, replicasets, pods, logs, events, terminal`
   (OCP Deployment: Details·YAML·ReplicaSets·Pods·Events; Pod: Details·YAML·Logs·Events·Terminal). A descriptor opts in
   with `extraTabs?: readonly ('replicasets' | 'logs' | 'terminal')[]`; routes stay static lazy modules per tab and
   `hasTab` gates them (an unknown tab for a kind keeps today's redirect).
3. **Actions:** a descriptor may declare `useKindActions?(args: KindActionArgs<T>): KindActions` (one hook per kind,
   items + its dialog). `useResourceActions` returns kind items first, then "Edit labels", "Edit annotations",
   "Edit <Kind>", "Delete <Kind>" (OCP `useCommonActions` order). It calls `descriptor.useKindActions ?? noKindActions`
   unconditionally; menus are keyed by `modelKey` so a kind change remounts (rules of hooks). Every write is gated by
   `useResourceAccess` (widened to `verb: AccessVerb` + `subresource?`), aria-disabled with the reason, never hidden.
4. **Writes are JSON Patch** (RFC 6902, `application/json-patch+json`) through `k8sPatch` — OCP's choice for every
   action we copy, explicit `add`/`replace` per path. Scale goes to the `scale` subresource (narrower RBAC:
   `patch deployments/scale`). Mutations go through `useResourceMutation` (TanStack `useMutation` + success toast
   "`<msg>` on `<cluster display name>`"); modal failures render inline (`Status.message`), modal-less failures
   (restart, pause, ring) a danger toast with the message (ACT-6). Modals share `ResourceMutationModal`
   (PF `Modal variant="small"`, Save/Cancel, `ClusterContextText`: "in <ns> on **<display name>**" + env label, SAFE-1).
5. **Terminal:** `@xterm/xterm` + `@xterm/addon-fit` (OCP's libraries, pinned). `shared/ui/terminal/XTerm.tsx` is the
   only code that mounts a DOM library into a ref it owns (`terminal.open(ref.current)`); it disposes on unmount and
   never touches `document` (FRONTEND.md DOM rule, second allowed pattern). `shared/k8s/exec.ts` owns the
   `base64.channel.k8s.io` protocol: same-origin `ws(s)://` URL built by `resourceApiPath(..., { subresource: 'exec' })`
   with repeated `command` params, channels 0 stdin, 1 stdout, 2 stderr, 3 error (`Status` JSON; non-Success → print
   `message`, TERM-9), 4 resize (`{"Width","Height"}`). Base64 via `TextEncoder`/`atob` helpers in that file (no
   `js-base64`). No CSRF header is possible on a WebSocket; the proxy checks `Origin` (SECURITY.md). The 60-min cap is
   server-side (ADR-0036 §1); the client has no timer: any close (incl. 1006) → TERM-3 "closed" alert + Reconnect.
   CSP `connect-src 'self'` covers same-origin `ws(s):` in CSP3 browsers; the terminal e2e runs under the prod CSP.
6. **Logs: streaming `fetch` (Q4).** `streamPodLog()` reads `…/log?follow=true&timestamps=true[&tailLines=1000]
   [&previous=true][&sinceTime=]` with `TextDecoderStream` and yields `{ ts, text }` lines (timestamp stripped). The
   stream is component state (`usePodLog`), not TanStack Query — it is not cacheable server state (precedent:
   `useEventStream`). Buffer: last 1,000 lines unless "Show full log". Reconnect (LOG-6, ADR-0036 Consequences): EOF or
   a rejected reader while the live pod shows the container running → reconnect after 1 s with
   `sinceTime=<last ts, truncated to the second>`, skipping lines older than the last ts and the first *k* lines at
   exactly the last ts (*k* = lines already seen at that ts). Viewer: `@patternfly/react-log-viewer` (OCP's).
   "Download" and "View raw logs" are plain same-origin links to the proxy URL (`download="<pod>-<container>.log"`,
   `target="_blank"`), so the browser streams to disk and JS never buffers the log (LOG-8).
7. **Ring scale** debounces clicks with `use-debounce` (`useDebouncedCallback`, 1 s, flushed on unmount) into one
   scale request, as OCP `PodRing` does with lodash.
8. **Mocks:** `mocks/k8s` applies JSON Patch with `fast-json-patch` (devDependency, mock-only), serves `scale`,
   `log` (streamed `ReadableStream`, `mockK8s.appendLog`) and exec over MSW `ws.link` (echo + error-channel cases), so
   every CP4a FE task runs on MSW before the backend.

## Consequences
- New dependencies (exact pins, one task installs all): `@patternfly/react-log-viewer` (PF 6 line), `@xterm/xterm`,
  `@xterm/addon-fit`, `use-debounce`; dev: `fast-json-patch`. Terminal and log viewer load only in their lazy tab chunks.
- `features/workloads` from the old FRONTEND.md tree is gone; FRONTEND.md tree, routes and DOM rule updated.
- Read-only copy: the existing UI-9 reasons (identical to the proxy's 403 details) stay the tooltip text; TERM-4's
  empty state uses the spec's fleet copy.
