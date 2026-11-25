---
id: T-0368
title: Installed Operators details — OCP header type scale and Subscription tab inset
status: done
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0366]
paths: [web/src/features/resources/operators, web/src/shared/ui/page/PageHeading.tsx]
review_rounds: 1
---

## Goal
Two measured mismatches on the CSV details page from the CP5b audit (T-0338). An OCP user sees a different header
size and a Subscription tab content that is indented further than every other tab.

## Scope
- In: the CSV details header title block; the Subscription tab container and its first DescriptionList margin.
- Out: other kinds' headings, operand tabs.

## Contract / design notes
Findings (screen — problem — OCP reference — fix). Measured with the probe: ours mock prod-eu-1 cert-utils-operator
vs ref `/k8s/ns/aap/operators.coreos.com~v1alpha1~ClusterServiceVersion/aap-operator.v2.7.0-0.1794591164`, 1280 light.
1. CSV details header — display name 24px/600, block 49px at y=215 — OCP `public/components/catalog/_catalog.scss`
   L227-240 (`.co-clusterserviceversion-logo__name__clusterserviceversion { font-size: 15px; margin-bottom: 5px }`,
   `.co-page-heading .co-clusterserviceversion-logo__name { margin: spacer--sm 0 }`) and
   `cluster-service-version-logo.tsx` L52-69 — measured OCP: name 15px/600 (20px line box), caption 12px/600 subtle
   (it inherits the outer heading weight), column block 40px tall starting 8px below the heading row (y 223 vs 215);
   logo x and size (40px) already match — reproduce: name 15px with 5px below, caption weight 600, 8px top/bottom
   margin on the title block. Keep the h1 holding only the name (T-0366 round 2). Comment the CSS with the OCP rule.
2. Subscription tab — content inset 23px further than other tabs (h2 x=369 width 848 vs OCP x=346 width 894): the
   tab renders a PageSection inside the details PageSection (two `pf-v6-c-page__main-section` with 16px 23px padding)
   — OCP `subscription.tsx` L405-420 `SubscriptionDetails` is one `PaneBody` (`co-m-pane__body`, padding 16px 23px) —
   render the tab body without its own PageSection (same container as the Details tab). Also its first
   DescriptionList has `margin-bottom: 24px` (`pf-v6-u-mb-lg`, `CsvSubscriptionTab.tsx:79`), OCP 0 — drop it.

## Context pack
- Touch points: `operators/CsvLogo.tsx:CsvHeaderTitle`, `registry/kinds/clusterserviceversions.tsx` (`detailsHeading`),
  `shared/ui/page/PageHeading.tsx` (`titleCaption`, T-0366), `operators/CsvSubscriptionTab.tsx` (L79, outer container).
- OCP reference: as above; `co-m-pane__body` = PaneBody.
- Probe: `scratchpad m.mjs`-style computed-style diff or `scripts/ui-probe.mjs --pair 'h1=h1'` on the two routes above.

## Acceptance criteria
- [x] Header: name 15px/600, caption 12px/600 subtle, title block 40px tall at heading top + 8px (probe vs ref).
- [x] Subscription tab h2 at the same x/width as the Details tab and OCP (346 / 894 at 1280); DL margin-bottom 0.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: lead-icon heading gets OCP's logo type scale in `PageHeading.module.css`; Subscription
  tab renders its sections unwrapped (like Details), states in a `PageBody`; DL `mb-lg` dropped. Probe matches OCP.

## Review
- Round 1 (frontend-architect, 2026-11-25): **APPROVE**. Logo heading styles keyed on `leadIcon` with no new prop: OK. Its
  only user is the CSV `detailsHeading`; the styles are documented on the prop and in the CSS with the OCP `_catalog.scss` rule. Subscription
  tab in the plain tab panel, with its states in a `PageBody`: OK. `subscription` is a CSV-only `extraTabs` entry, so other kinds'
  details/YAML/Events panels are unchanged; DL `mb-lg` dropped. Targeted gate green (details, operators, shared/ui: 166 tests).
  - Optional: if a second kind ever passes `leadIcon`, split the CSV type scale into its own flag; the coupling is fine with one user.
- Round 1 (ux-designer, 2026-11-25): **APPROVE**. Probe: mock cert-utils-operator (alice/prod-eu-1) vs ref aap-operator, Details and Subscription tabs, 1280 light. Header identical: name 15px/600 at 427,223 with mb 5px, caption 12px/600 subtle rgb(77,77,77) at y=248, title block 40px with mb 8px; still one h1 holding only the name. Subscription tab h2 at x=346 width 894 like OCP and the Details tab; DL margin-bottom 0. Remaining 8px y offset is OCP's scrollable tab bar (34 operand tabs, scroll buttons, 53px vs 45px), content-driven, not a finding.

## Handover notes
- Header: `PageHeading` applies the 15px name (via `--pf-v6-c-title--m-h1--FontSize`, PF's selector beats one class),
  5px below, 8px block margins and the heading-font/600/heading-line-height caption whenever `leadIcon` is set: in
  OCP the logo heading is the only lead-icon heading, so no extra prop. Probe vs ref: name 15px/600 20px box, caption
  12px/600 16px box, block 40px tall — no style mismatches (only text widths).
- Subscription tab: outside `paths`, `ResourceDetailsPage` `ResourceTabs` now renders `subscription` in the same plain
  tabpanel as `details` (OCP's two `PaneBody`s = our `DetailsSubsection`s); `CsvSubscriptionTab` wraps its error /
  loading / empty states in `PageBody` so they keep the padding. Probe: dl 894px wide, h2/dl x match OCP.
- No new unit tests: the changes are CSS/containers jsdom can't measure; existing tab tests still pass.
