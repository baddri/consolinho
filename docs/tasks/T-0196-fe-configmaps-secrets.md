---
id: T-0196
title: ConfigMaps and Secrets — data sections, copy, masked Secret values
status: todo
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
- [ ] CFG-1: ConfigMap details show Data and Binary data with copy buttons; no Events tab (test).
- [ ] CFG-2/3: Secret list shows Name, Namespace, Type, Size, Created; details mask values by default; "Reveal values" shows `username`, "Hide values" masks again; remount re-masks (tests).
- [ ] CFG-4: toast after editing a Secret contains only name + cluster (test).
- [ ] CFG-5: on an RO cluster "Reveal values" works and edit actions are aria-disabled (test).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
