---
id: T-0368
title: Installed Operators details — OCP header type scale and Subscription tab inset
status: todo
owner: frontend-engineer
checkpoint: 5b
depends_on: [T-0366]
paths: [web/src/features/resources/operators, web/src/shared/ui/page/PageHeading.tsx]
review_rounds: 0
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
- [ ] Header: name 15px/600, caption 12px/600 subtle, title block 40px tall at heading top + 8px (probe vs ref).
- [ ] Subscription tab h2 at the same x/width as the Details tab and OCP (346 / 894 at 1280); DL margin-bottom 0.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
