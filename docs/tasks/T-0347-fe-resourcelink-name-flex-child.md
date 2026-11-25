---
id: T-0347
title: ResourceLink — name is a direct flex child (21px, as OCP co-resource-item)
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: []
paths: [web/src/features/resources/components/ResourceLink.tsx, web/src/features/resources/components/]
review_rounds: 0
---

## Goal
Our `ResourceLink` name `<a>` is `display: inline`, 18px tall, inside a `FlexItem` div. OCP's
`.co-resource-item` is `display: flex; align-items: baseline` with the badge and the `<a>` as **direct** flex
children, so the `<a>` is blockified: 21px tall, PF's dashed link underline sits under a full line box. Visible in
every list Name column and every details link (SC/PVC/PV links most). Found by T-0306 review, measured by T-0310.

## Contract / design notes
Probe (`/c/dev-1/k8s/ns/shop/persistentvolumeclaims` vs `/k8s/ns/consolinho/persistentvolumeclaims`, pair `td a=td a`,
props display,height): ours `display: inline`, box 49x18; OCP `display: block`, height 21px. Container box 21px on both.
Fix (exact): in `BadgedName`, drop the `FlexItem` wrapper around `children` so the `Link` (or plain text) is the
`Flex`'s direct child; keep the badge's `FlexItem flex={{ default: 'flexNone' }}`. Plain-text names: wrap in a `span`
so they stay a single flex item. Keep `min-width: 0`/wrapping behaviour (OCP `co-resource-item__resource-name`
`min-width: 0`) — check a long name still wraps/truncates as today in a narrow column.

## Context pack
- `web/src/features/resources/components/ResourceLink.tsx` `BadgedName` (~L14-29).
- OCP `public/components/_resource.scss` L106-129 (`.co-resource-item`), `ResourceLink` in
  `public/components/utils/resource-link.tsx`.

## Acceptance criteria
- [x] Probe `td a`: display block, height 21px, 0 other mismatches on PVC/Pods lists vs OCP.
- [x] Details-page links (PVC StorageClass, PV Claim) also 21px; long names wrap as before.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: `BadgedName` renders an element child directly as the Flex child (plain text in a `span`); `ResourceLink.module.css` gives the last child `min-width: 0` (OCP `__resource-name`).
- Probe `td a` PVC and Pods lists: display block, height 21 = OCP; left only box width (content) and gap-to-prev 0 vs 4 (our badge's 4px margin sits inside its FlexItem; container 21px both). PVC details `dd a` block/21px.

## Review
- 2026-11-25 ux-designer: **APPROVE**. Measured on mock vs OCP ref (PVC list, Pods list, PVC details StorageClass `dd`): `a` display block, 21px, 14px/21px, dashed underline, parent flex = OCP `.co-resource-item` (`_resource.scss` L106-129).
- Visible badge 18x18, 1px below the link top, 4px badge→link on all three = OCP. The probe's gap-to-prev 0 vs 4 only reflects the badge FlexItem box holding the margin (16+40 = 16+36+4); visually identical.
- Long unbroken name in a 160px container: link 138x21, same as OCP (neither breaks it). Container `word-break` normal vs OCP break-word has no visible effect here; not filed.
- 2026-11-25 frontend-architect, round 1: **APPROVE**. `BadgedName` puts the name element directly in the Flex (blockified `<a>`, as OCP `.co-resource-item`), text in a `span`; `.resourceItem > :last-child { min-width: 0 }` = OCP `__resource-name`. Kept badge `FlexItem` per contract; gap-to-prev artifact accepted. check-fe green.

## Handover notes
- `gap-to-prev` 0 vs 4px is a measurement artifact of the kept badge `FlexItem` (task contract); visual offset is the same.
