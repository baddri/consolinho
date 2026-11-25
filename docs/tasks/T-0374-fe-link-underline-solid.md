---
id: T-0374
title: Links have no dashed underline (solid on hover); dashed stays only for details field-help terms
status: done
owner: frontend-engineer
checkpoint: 5.5
depends_on: []
paths: [web/src/app/global.css, web/src/app/main.tsx, web/src/shared/ui/ResourceLink.tsx, docs/architecture/UX.md]
review_rounds: 0
---

## Goal
List-table links (resource names, the "3 of 3 pods" status link, the pod selector) show a dashed underline at rest.
None of our CSS does that. It comes from PatternFly's base rule `:where(a)`
(`@patternfly/patternfly/patternfly-base.css` L125–140). That rule uses
`--pf-t--global--text-decoration--link--line--default` (underline) and `--link--style--default` (dashed). OCP
releases on older PF don't show it, and the human wants the OCP look: no underline at rest, solid underline on hover.
The dashed help-text affordance on details-page field terms must stay.

## Scope
- In:
  - A global token override for link decoration.
  - A comment fix.
  - A UX.md note.
- Out:
  - Per-component overrides.
  - Changes to field-help popovers.
  - The high-contrast theme (PF keeps dashed links there for accessibility).

## Contract / design notes
- New `web/src/app/global.css`, imported in `app/main.tsx` **after** the PF base and addons CSS:
  ```css
  :root:not(.pf-v6-theme-high-contrast) {
    --pf-t--global--text-decoration--link--line--default: none;
    --pf-t--global--text-decoration--link--style--default: solid;
    --pf-t--global--text-decoration--link--style--hover: solid;
  }
  ```
  - Add a short comment explaining why (OCP parity, T-0374) and that high contrast is excluded on purpose.
  - This is the only global stylesheet. Don't add other rules to it in this task.
- Field help is unaffected: `DescriptionListTermHelpTextButton` uses the separate
  `--pf-t--global--text-decoration--help-text--*` tokens. Verify it still shows dashed.
- Inline link buttons (`Button variant="link" isInline`) follow the same tokens, so they lose the at-rest underline too. That matches released OCP. Check one (e.g. "Edit" count links) in the probe.
- `shared/ui/ResourceLink.tsx`: update the comment that mentions "PF's dashed underline".
- `UX.md`: add one line to the links/typography section saying links have no underline at rest and a solid one on hover, with dashed reserved for field help.

## Context pack
- Touch points:
  - `web/src/app/main.tsx` (PF css imports).
  - `shared/ui/ResourceLink.tsx` (comment).
  - `features/resources/registry/columns.tsx:PodSelectorLink`, `ReplicasCountLink` (L70–74, L102); these are verify-only, no change.
  - `shared/ui/page/DetailsGrid.tsx` ~L126–141 (field help, which must stay dashed).
- PF tokens: `node_modules/@patternfly/patternfly/base/tokens/tokens-default.scss` L388–390, `tokens-highcontrast.scss` L358–361.
- OCP reference:
  - `/home/bad/works/openshift-console/frontend/public/components/_resource.scss` `.co-resource-item` (resource link, no decoration rules).
  - `public/components/utils/details-item.tsx` (field-help popover term).
  - Note: the clone is on PF 6.6.1 with the same base tokens, so compare against released OCP behaviour, as the human did.

## Acceptance criteria
- [x] In light and dark themes, list links (name, pod status count, pod selector) have no underline at rest and a solid underline on hover (`scripts/ui-probe.mjs` computed `text-decoration-line` / `-style` in the Work log).
- [x] Details-page field-help terms still render dashed. The high-contrast theme still renders dashed links.
- [x] No component-level CSS overrides were added. `ResourceLink` comment and `UX.md` are updated.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: in_progress → in_review. Added `app/global.css` (token override, high contrast excluded), imported after PF CSS; ResourceLink comment + UX.md §1 note.
- Probe (light+dark, `/c/dev-1/k8s/all-namespaces/deployments`): name, pod-count and selector links `text-decoration-line=none; style=solid`; hover tokens resolve `underline`/`solid`. Pods Status popover toggle (inline link button): `none; solid`.
- Probe `/c/dev-1/k8s/ns/shop/deployments/worker`: field-help term `underline; dashed`; description links `none; solid`.

## Review

## Handover notes
- `web/src/app/global.css` is the single global stylesheet; it only overrides PF's three link decoration tokens under `:root:not(.pf-v6-theme-high-contrast)`.
- The comment to fix lives in `features/resources/components/ResourceLink.tsx` (`BadgedName`), not `shared/ui/ResourceLink.tsx` as the task's `paths` said.
- High contrast is not probe-verifiable (the probe has no contrast flag); it is excluded by selector, so PF's high-contrast tokens (dashed) apply unchanged.
- The probe can't hover, so hover is checked via the resolved hover tokens (`underline`/`solid`), not the `:hover` computed style.
