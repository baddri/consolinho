---
id: T-0122
title: OCP parity — resource details pages (heading, DescriptionList fields, labels, deployment pod ring)
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0121]
paths: [web/src/features/resources/details, web/src/features/resources/components, web/src/shared/ui]
review_rounds: 0
---

## Goal
Pod, Deployment, ConfigMap, Service and Project details must match OCP's heading and Details tab. Absorbs T-0118 item 5
and the `Timestamp`/`DetailsSubsection` move of item 10.

## OCP reference
- Routes: `/k8s/ns/openshift-console/pods/<pod>`, `/k8s/ns/openshift-console/deployments/console`.
- Source: `public/components/utils/headings.tsx` (title block L160-185), `packages/console-dynamic-plugin-sdk/src/app/
  components/utils/resource-status.tsx` + `.scss`, `public/components/utils/details-page.tsx:ResourceSummary`
  (L75-160), `public/components/utils/details-item.tsx`, `public/components/utils/label-list.tsx`,
  `public/components/utils/_label.scss`, `public/components/pod.tsx` (L300-440), `public/components/deployment.tsx`
  (`DeploymentDetailsList` L45-90, `DeploymentDetails` L95-135), `packages/console-shared/src/components/pod/PodRingSet.tsx`.

## Differences to fix
1. Heading — small pale badge, status as outlined compact `Label` with green check — OCP: `co-m-resource-icon--lg`
   badge (T-0121), name, status as PF `Badge isRead` wrapping status icon + text, `padding-left: spacer--sm`
   (`resource-status.scss`) — mirror. Star (T-0120) left of "Actions".
2. Deployment heading — "2 of 3 pods" label — OCP shows no status in the Deployment heading; status is a "Status" row
   ("Up to date"/"Updating") in the left column — move it.
3. Deployment details — no pod ring; right column lists replica counts — OCP: `PodRingSet` donut (pod count, read-only;
   no scale arrows since we have no scale action), right column "Update strategy", "Max unavailable" ("1 of 2 pods"),
   "Max surge", "Progress deadline seconds", "Min ready seconds"; then sections Containers, Volumes, Conditions, each
   with `SectionHeading`, each in its own padded section — mirror field order and copy from `deployment.tsx`.
4. Pod details — right column Node/Pod IP/QoS — mirror `pod.tsx` order: Status, Restart policy, Active deadline
   seconds, Pod IP, Host IP, Node, Image pull secret…; sections Containers, Volumes, Conditions.
5. Common metadata — "Created" — OCP `ResourceSummary`: Name, Namespace, Labels, Pod selector/Node selector/Tolerations
   (when relevant), Annotations, "Created at", Owner — mirror labels and order.
6. Namespace field — `PR` badge [T-0118 #5] — `NS` badge (Namespace colour); Projects nav keeps `PR`.
7. Labels — outlined compact labels — OCP `LabelGroup numLabels={20} defaultIsOpen` of default filled `Label`s with
   `href` to search (`key=value`), inside a box with border `--pf-t--global--border--width--regular` solid
   `--pf-t--global--border--color--default`, radius `--small`, padding `--xs` (`_label.scss` `.co-editable-label-group`);
   empty → "No labels" in `pf-v6-u-text-color-subtle`. No "Edit" link (no label editing feature).
8. Field help popovers (dashed term underline, OpenAPI descriptions) — out of scope; follow-up task.
9. Move `Timestamp` and `DetailsSubsection` to `shared/ui` with a unit test [T-0118 #10].

## Context pack
- Docs: `UX.md` §3, §6.
- Touch points: `web/src/features/resources/details/ResourceHeader.tsx`, `MetadataSection.tsx`,
  `sections/PodDetails.tsx`, `sections/ConfigMapDetails.tsx`, `sections/DetailsSubsection.tsx`;
  `web/src/shared/ui/LabelList.tsx`, `shared/ui/page/DetailsGrid.tsx`, `SectionHeading.tsx`;
  `features/resources/components/Timestamp.tsx`.
- PF: `Badge isRead`, `DescriptionList`, `Grid`/`GridItem sm={6}`, `LabelGroup`, `Label href`, `ChartDonut` only if
  already a dependency (else a PF-token SVG ring; frontend-architect decides).

## Acceptance criteria
- [ ] Side-by-side pod details and deployment details vs the OCP routes above match at 1280 in light and dark.
- [ ] Field labels/order equal OCP's for Pod and Deployment (unit test on the descriptor output).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
