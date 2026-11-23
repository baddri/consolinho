---
id: T-0180
title: Pod Terminal tab — exec WebSocket protocol, xterm wrapper, mock echo shell
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0174, T-0175]
paths: [web/src/shared/k8s/exec.ts, web/src/shared/k8s/exec.test.ts, web/src/shared/k8s/index.ts, web/src/shared/ui/terminal, web/src/features/resources/workloads/terminal, web/src/mocks/k8s/exec.ts, web/src/mocks/handlers.ts, docs/architecture/UX.md]
review_rounds: 0
---

## Goal
ADR-0037 §5, TERM-1..5, 9, 10: an OCP-like Terminal tab that opens an interactive shell in a chosen container
through the proxy exec relay (BE topic "exec WebSocket relay / Origin check / 60-min cap / audit"), developed
against an MSW `ws` echo shell.

## Scope
- In: `exec.ts` (URL + channel codec), `shared/ui/terminal/XTerm.tsx` (only allowed DOM-library mount, ADR-0037),
  `useExecSession`, replace `PodTerminalTab.tsx` stub, mock `ws.link` echo shell, tests; UX.md §12 note on the
  terminal (font, dark background, height).
- Out: reconnect on its own (OCP has none — the user clicks Reconnect), debug container, node terminal.

## Contract / design notes
- UX (T-0175 review): a single-container pod shows "Connecting to" + the container label in the toolbar, not a dropdown (OCP `public/components/pod-connect.tsx` L256-268). Use `ContainerSelect isOptionDisabled` for non-running containers and `useSelectedContainer({ includeInit: false })` (added in T-0175).
- `execUrl(cluster, ns, pod, { container, command = ['sh','-i','-c', OCP_SHELL] })` → `ws(s)://<origin>/api/clusters/<c>/k8s/api/v1/namespaces/<ns>/pods/<pod>/exec?stdout=1&stdin=1&stderr=1&tty=1&container=…&command=…`
  (OCP `pod-connect.tsx` L123-132 command `TERM=xterm sh -c "bash || sh"` — copy the semantics, our string).
  Subprotocol `base64.channel.k8s.io`. Codec: `encodeStdin(text)` = `'0' + base64(utf8)`, `encodeResize(cols, rows)`
  = `'4' + base64(JSON {Width, Height})`, `decodeFrame(data) → { channel: 1|2|3; bytes: Uint8Array }` (TextEncoder/atob;
  no js-base64). Channel 3 = JSON `Status`; `status: 'Failure'` → error message shown.
- `useExecSession({ url, enabled })` → `{ state: 'connecting'|'open'|'closed'; closeReason?: string; write; resize; reconnect }`
  holding the `WebSocket` in a ref; closes on unmount/container change. Any close (incl. 1006 / server cap, ADR-0036)
  → `closed`.
- `XTerm({ onData, onResize, write$ })` — `forwardRef` handle `{ write(bytes), focus(), reset() }`; mounts
  `Terminal` + `FitAddon` into its own `div` ref; `ResizeObserver` → `fit()` → `onResize(cols, rows)`; disposes on
  unmount. No other code touches xterm or the DOM.
- Tab (OCP `pod-connect.tsx` L64 `PodConnect`): toolbar "Connecting to" + `ContainerSelect` (non-init only, running
  only enabled); "Expand" like Logs; terminal fills the panel. On close: inline `Alert variant="warning"` (OCP L162
  "The connection was closed.") + "Reconnect" button (TERM-3). Pod not running → info `EmptyState`
  (TERM-5 copy from spec). RO/RBAC (`create pods/exec`, `useActionAccess`) → `Alert` with the spec TERM-4 copy, no socket.
- Mock: `ws.link('*/k8s/api/v1/namespaces/*/pods/*/exec')` echoes stdin back on channel 1 after a `$ ` prompt;
  `exit` → channel 3 Success + close 1000; `mockK8s.closeExec(code)` for tests.

## Context pack
- Docs: ADR-0037 §5; ADR-0036 §2-3 (relay, Origin, cap, close semantics); `SECURITY.md` § CSP (`connect-src 'self'` covers ws same-origin — verify, note if not).
- Exemplars: `shared/k8s/watch.ts` (abort/cleanup shape); MSW `ws` API: `grep -n "link\|addEventListener" web/node_modules/msw/lib/core/ws.d.ts`;
  xterm: `grep -n "class Terminal\|open(\|onData\|dispose" web/node_modules/@xterm/xterm/typings/xterm.d.ts`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/pod-connect.tsx` L64 `PodConnect`,
  L123-132 subprotocols/command, L162 close message, L230 `onResize`, L258 "Connecting to";
  `public/components/terminal.tsx` L35 `Terminal`; `public/components/pod.tsx` L463 `PodConnectLoader`.

## Acceptance criteria
- [ ] TERM-1: Terminal tab opens a session to the selected running container; typed input echoes (MSW ws test).
- [ ] TERM-2: container switch closes the old socket and opens a new one; `?container=` honoured.
- [ ] TERM-3: server close (1006 / cap) → "The connection was closed." + Reconnect re-opens.
- [ ] TERM-4: RO grant / no `create pods/exec` → spec copy, no WebSocket opened (test).
- [ ] TERM-5: non-running pod → empty state, no socket. TERM-9: resize frames sent on fit. TERM-10: socket closed on unmount/tab change.
- [ ] Codec round-trips UTF-8 (unit test); only `XTerm.tsx` imports `@xterm/*` (lint `no-restricted-imports` if cheap).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
