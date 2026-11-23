---
id: T-0180
title: Pod Terminal tab — exec WebSocket protocol, xterm wrapper, mock echo shell
status: done
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0174, T-0175]
paths: [web/src/shared/k8s/exec.ts, web/src/shared/k8s/exec.test.ts, web/src/shared/k8s/index.ts, web/src/shared/ui/terminal, web/src/features/resources/workloads/terminal, web/src/mocks/k8s/exec.ts, web/src/mocks/handlers.ts, docs/architecture/UX.md]
review_rounds: 1
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
- [x] TERM-1: Terminal tab opens a session to the selected running container; typed input echoes (MSW ws test).
- [x] TERM-2: container switch closes the old socket and opens a new one; `?container=` honoured.
- [x] TERM-3: server close (1006 / cap) → "The connection was closed." + Reconnect re-opens.
- [x] TERM-4: RO grant / no `create pods/exec` → spec copy, no WebSocket opened (test).
- [x] TERM-5: non-running pod → empty state, no socket. TERM-9: resize frames sent on fit. TERM-10: socket closed on unmount/tab change.
- [x] Codec round-trips UTF-8 (unit test); only `XTerm.tsx` imports `@xterm/*` (lint `no-restricted-imports` if cheap).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23: exec codec/URL (`shared/k8s/exec.ts`) and `XTerm` wrapper (`shared/ui/terminal`). Also `useExecSession`, the PodTerminalTab and the MSW `ws.link` echo shell with its own `create pods/exec` check and handshake audit. Tests: codec (8) and tab (8, TERM-1..5/9/10). UX.md §12 note added. Status: in_review.
- 2026-11-23 fix round 1: the terminal now sizes to the viewport (basis-0 body, absolutely placed xterm); the probe was not run because :5199 was off-limits. Changed: RhUi expand icons, empty-state icons with no Bullseye, single-container copy without "choose", Expand hidden with no terminal, spinner until the socket opens. The mock close is deferred behind its output. `ContainerLabel` is now exported from ContainerSelect. 4 tests added. Gate: 986/986, build ok.

## Review
### Round 1 UX (ux-designer, 2026-11-23): CHANGES_REQUESTED
OK: toolbar "Connecting to" + `ContainerLabel`/`ContainerSelect` (Flex column/row-on-sm, 16px gap, disabled non-running option, `?container=` kept), switching container refocuses a new shell, xterm Red Hat Mono 16px white on black with 10px inset, closed Alert warning inline + Reconnect, Expand hidden on close. All match OCP `public/components/pod-connect.tsx` L248-320, `terminal.tsx` L9-10, `_terminal.scss`.
1. Pod terminal at 1280×800: the terminal does not fit the viewport. It is 548px tall (xterm's intrinsic 24 rows) and ends at y=901 while main ends at 783, so the page scrolls 134px. At 1920×1080 it fits. Cause: `PageSection pf-m-fill` is `flex: 1 0 auto` and grows to the content. OCP `terminal.tsx` L53-63 sizes the terminal to `page.bottom - top - 52` and never scrolls. Fix: let the fill chain shrink (`min-height: 0` / basis 0 on the tab body) so `.body` takes the remaining height. Probe: `.xterm` bottom ≤ main bottom at 1280×800.
2. Toolbar Expand uses FontAwesome `ExpandIcon`/`CompressIcon`. OCP `pod-connect.tsx` L296 uses `RhUiExpandIcon`, and our `YamlEditor.tsx` uses `RhUiExpandIcon`/`RhUiCompressIcon`. Fix: use the RhUi icons.
3. Crash-looping single-container pod (`web-…-tq5wn`): the body says "Choose a running container." although there is no picker, and Expand is shown with no terminal to expand. Fix: drop the second sentence when there is only one container, and hide Expand when there is no terminal (OCP hides it on `error`, L286).
4. TERM-4/5 and not-running EmptyStates have no icon (UX.md §10 "EmptyState with a PF icon"), and `Bullseye` places them about 220px down the panel. Fix: add an icon (e.g. `LockIcon` for no access, `InfoCircleIcon`/`CubesIcon` for not running) and drop the full-height Bullseye, so the state sits at the top of the tab like other tab empty states.
5. While connecting, an empty black box is shown with no feedback. OCP shows `LoadingBox` until `open` (`pod-connect.tsx` L235-240). Fix: show a Spinner/Skeleton in the body while `state === 'connecting'`.
6. (minor, mock) `exit` + Enter renders "$ exitThe terminal connection has closed." on one line because the echo shell sends no CRLF for the final Enter. Fix it in `mocks/k8s/exec.ts`. Real shells echo the newline.
- Note, not blocking (shared `useResourceAccess`, out of paths): the RBAC reason "The service account for prod-eu-1 cannot create pods/exec in shop (cluster RBAC)." uses internal wording. Candidate follow-up.
Round 1 (frontend-architect, 2026-11-23): **APPROVE**
- Protocol: `base64.channel.k8s.io` + `sh -i -c "TERM=xterm sh"` match TERM-1/ADR-0037 §5 and OCP L123-132 (no v4/v5 needed). Codec 0/3/4 correct, UTF-8 round-trip tested.
- Lifecycle: `useExecSession` keys the socket on `url`+generation; cleanup nulls handlers and closes (container switch, reconnect, unmount). Resize is remembered and resent on open. Any close → `closed`, no auto-reconnect (OCP).
- DOM/lazy: only `XTerm.tsx` touches xterm/DOM; xterm (~350 KB) is only in the `PodTerminalTab` lazy chunk (checked dist); the main chunk holds only the codec.
- Deviations accepted: the close copy follows spec TERM-3/OCP (the task AC text was wrong). The `mocks/handlers/index.ts` + `mocks/k8s/index.ts` edits are required (the task listed a nonexistent path).
- TERM-1..5, 9, 10 covered (TERM-10 keyboard documented in UX.md §12). TERM-6/7/8 are BE (T-0157).
- Gate: lint/typecheck/build ok; 3 timeouts (AuditLogPage x2, projectSelector) unrelated, pass when run alone.
- Follow-up (file as a small FE task): export `ContainerLabel` from `workloads/ContainerSelect.tsx` and drop the copy at `PodTerminalTab.tsx` `ContainerLabel`. Add an `eslint.config.js` `no-restricted-imports` rule for `@xterm/*` (allowed only in `shared/ui/terminal`).
- Nit (optional): the "Pod is not running" / "Container is not running" copy is ours (the spec has none). Have UX confirm it in the parity pass.
### Round 2 UX (ux-designer, 2026-11-23): APPROVE
1. Fixed. At 1280×800, `.xterm` ends at 767 and main at 783, and main scrollHeight = clientHeight (693), also with the closed Alert shown. At 1920×1080 it ends at 1047 against 1063, no scroll.
2. Fixed. `RhUiExpandIcon`/`RhUiCompressIcon`.
3. Fixed. A single-container crash loop says "Container web is not running." and Expand is hidden.
4. Fixed. `CubesIcon`/`LockIcon` EmptyStates sit at the top of the tab, no Bullseye.
5. Fixed. A Spinner overlay shows while `state === 'connecting'` (code-checked; the mock opens instantly).
6. Fixed. `exit` prints the close message on its own line.
No regressions in the RO, RBAC, multi-container switch or Reconnect paths.

## Handover notes
- Close copy follows OCP/spec, "The terminal connection has closed.", not the AC's "The connection was closed.". A server close reason (e.g. the 60-min cap) replaces it as the Alert title. Reconnect opens a new upgrade, and the proxy re-checks access.
- TERM-4/TERM-5 are EmptyStates (spec); a non-running container in a multi-container pod is an EmptyState, and that option is disabled in the select.
- Outside listed paths, all required: `mocks/handlers/index.ts` (no `mocks/handlers.ts` exists) registers `execHandler`; `mocks/k8s/index.ts` merges `mockExec` into `mockK8s`.
- `no-restricted-imports` for `@xterm/*` was not added (`eslint.config.js` is outside paths). Today only `XTerm.tsx` imports xterm. Follow-up.
- `shared/ui/terminal` is deliberately not re-exported from `shared/ui/index.ts`, so xterm stays in the lazy terminal chunk.
- CSP: `default-src 'self'` covers same-origin ws(s) in CSP3 browsers. If a `connect-src` is ever added, it must include `'self'`.
- Height: `.body` has `flex-basis: 0` and `min-height: 15rem`, so the filled tab body doesn't grow past the viewport. A probe check at 1280×800 is still pending.
- Tests stub `XTerm` (no canvas in jsdom). Fullscreen Expand is hidden when the Fullscreen API is unsupported (jsdom).
