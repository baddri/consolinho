---
id: T-0196
title: ConfigMaps and Secrets — data sections, copy, masked Secret values
status: done
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0189]
paths: [web/src/features/resources/registry/kinds/configmaps.tsx, web/src/features/resources/registry/kinds/secrets.tsx, web/src/features/resources/workloads/config, web/src/features/resources/details/sections/ConfigMapDetails.tsx]
review_rounds: 0
---

## Goal
CFG-1..5: OCP's ConfigMap and Secret data views. Secret values masked by default, one page-wide "Reveal values" /
"Hide values" toggle, copy buttons, no Events tab (OCP).

## Contract / design notes
- Move `details/sections/ConfigMapDetails.tsx` into `workloads/config/` (keep `base64Size`/`formatBytes`, update the
  ConfigMap descriptor import; delete the old file).
- `workloads/config/DataSection.tsx` — `DataSection({ title, data, masked?, binary? })`: PF `DescriptionList` of key →
  value; text values in a `CodeBlock`/pre with PF `ClipboardCopy` (`variant="inline-compact"` or OCP's copy button);
  `masked` renders OCP's `MaskedData` (L20: fixed-width "•••" placeholder, `aria-label` "Value hidden"); binary
  entries show size + OCP-style download is **out** (no DOM blob tricks; show "<size> binary data" text, OCP L56).
  Empty → "No data found" (OCP).
- ConfigMap details (CFG-1): "Data" and "Binary data" sections (OCP `ConfigMapData` L82, `ConfigMapBinaryData` L56).
  Edit stays the common "Edit ConfigMap" → YAML. `hasEventsTab: false` (OCP `configmap.tsx` L176).
- Secret descriptor (CFG-2): columns Name, Namespace, Type, Size (key count, OCP `SecretsList` L162), Created;
  `hasEventsTab: false` (OCP `secret.tsx` L270). Details: `DetailsSection` with Type; "Data" section decoded from
  base64 (`atob` + `TextDecoder`; non-UTF-8 → treated as binary), masked by default; header button
  `SecretDataRevealButton` (OCP L115, copy "Reveal values"/"Hide values" L128/133, PF `Button variant="link"` with
  Eye/EyeSlash icons) toggles **component state** only — never URL/storage (CFG-2/3, re-masks on navigation). Copy
  button copies the decoded value even while masked (OCP does). YAML tab unchanged (base64 shown, CFG-3).
- CFG-4: the generic edit/label/annotation toasts already name object + cluster only — add a test that patching a
  Secret toasts "Updated db-credentials on <cluster>" and no value text; never log decoded values
  (`console.*` forbidden by lint already).
- CFG-5: reveal works for RO users (no gating); edit actions follow ACT-4 (common actions, no change).

## Context pack
- Exemplars: `details/sections/ConfigMapDetails.tsx` (current ConfigMap data), `registry/kinds/configmaps.tsx`,
  `actions/` common action tests (toast assertion pattern).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/configmap-and-secret-data.tsx`
  (`MaskedData` L20, `ConfigMapBinaryData` L56, `ConfigMapData` L82, `SecretValue` L103, `SecretDataRevealButton`
  L115-133, `SecretData` L140); `public/components/secret.tsx` (`SecretDetails` L88, `SecretsList` L162, tabs L270);
  `public/components/configmap.tsx` L176.

## Acceptance criteria
- [x] CFG-1: ConfigMap details show Data and Binary data with copy buttons; no Events tab (test).
- [x] CFG-2/3: Secret list shows Name, Namespace, Type, Size, Created; details mask values by default; "Reveal values" shows `username`, "Hide values" masks again; remount re-masks (tests).
- [x] CFG-4: toast after editing a Secret contains only name + cluster (test).
- [x] CFG-5: on an RO cluster "Reveal values" works and edit actions are aria-disabled (test).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: implemented `workloads/config/` (DataSection, CopyableValue, ConfigMapDetails,
  SecretDetails, dataValues); Secret/ConfigMap descriptors (columns, no Events tab); tests in `config.test.tsx`. Gate
  green (95 files, 1042 tests). Probe our side only (OCP ref :9000 was down), via a scratch copy on :5242.

## Review
- 2026-11-23 frontend-architect, round 1: **APPROVE**.
  - Deviations accepted: dash + sr-only "Value hidden" matches OCP `MaskedData` L20-27 verbatim (contract's "•••" was
    stale); `RhUiView*` icons match OCP L127; `DataValue` union instead of a `binary` flag is cleaner (mixed Secret keys).
  - Out-of-paths edits accepted: `SectionHeading`/`DetailsSubsection` `actions` slot is minimal, backward compatible,
    mirrors OCP `SectionHeading` children; ResourceDetailsPage test moves follow from `hasEventsTab: false`.
  - Leak check OK: masked values never reach the DOM (`CopyableValue` renders `visibleValue` only), no query keys/URL/
    storage, no logging, toasts name object + cluster only; reveal is uid-keyed component state.
  - Gate: touched tests + lint/typecheck green; full run had 44 timeouts in unrelated files (AuditLogPage etc.) under
    load avg ~20 from parallel agents, build ok — environmental, not this diff.
  - Nit (optional): `config.test.tsx:145` USERNAME `'shop'` equals the namespace, so it is a weak leak marker; L146's
    PASSWORD assertion carries the check.
- 2026-11-23 ux-designer, round 1: **APPROVE** (mock :5243, 1280, light; OCP ref :9000 down, judged vs clone source).
  - OK: Secrets list Name/Namespace(all-ns only)/Type/Size(key count)/Created/Actions = OCP `secret.tsx` L162; tabs Details, YAML.
  - OK: Data/Binary data each in own PaneBody, sorted keys, PF CodeBlock + plain ClipboardCopyButton, "Copy to clipboard"/"Copied" = OCP `utils/copy-to-clipboard.tsx`.
  - OK: masked "-" + sr-only "Value hidden", "Reveal values"/"Hide values" link right-aligned, pr 0, RhUiView/ViewOff icons = OCP `configmap-and-secret-data.tsx` L20/L115; "No value", "No Data found" (EmptyState sm, pt-xl-on-md = `ConsoleEmptyState`).
  - Accepted deviation (contract): binary keys show "<size> binary data" instead of OCP's "Save file" link (L42).
  - Nit (non-blocking): Reveal icon uses PF `icon` prop (button gap ~8px); OCP inlines icon with `co-icon-space-r` 0.25em — `configmap-and-secret-data.tsx` L123.
  - Nit (non-blocking, a11y): `CopyableValue` omits `textId`/CodeBlockCode `id`, so the copy button has no aria-controls (OCP passes `textId`).

## Handover notes
- Outside `paths` (minimal): `shared/ui/page/SectionHeading.tsx` + `DetailsSubsection.tsx` gained an optional `actions`
  slot (OCP SectionHeading children) for the Reveal button, rendered beside the h2 so its name stays "Data".
  `details/ResourceDetailsPage.test.tsx`: ConfigMap data tests moved to `config.test.tsx`; the "No events" test now
  uses services/web and the kind-tabs test expects ConfigMap tabs Details, YAML.
- Masked value follows the current OCP clone (`MaskedData`: sr-only "Value hidden" + aria-hidden dash), not "•••".
  Reveal icons are OCP's `RhUiViewIcon`/`RhUiViewOffIcon`. Reveal state is keyed by uid (re-masks on another Secret).
- `DataSection` takes `data: Record<string, DataValue>` (`DataValue = string | { binarySize }`) instead of a `binary`
  flag, so Secrets can mix text and binary keys. Binary shows "<size> binary data" (no Save file, per contract).
- Empty sections: "No Data found" / "No binary data found" (OCP EmptyBox); empty string values: "No value".
- CFG-4 toast is the existing "Labels of db-credentials updated on Development 1"; the test asserts no value text.
- `scripts/ui-probe.mjs` is hardwired to :5199 (forbidden for parallel agents); a port flag is a worthwhile follow-up.
