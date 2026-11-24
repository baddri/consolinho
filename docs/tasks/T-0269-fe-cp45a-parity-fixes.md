---
id: T-0269
title: CP4.5a parity fixes — Access tab headers, Group details sections, wizard review priority, grant form gap
status: todo
owner: frontend-engineer
checkpoint: 4.5a
depends_on: [T-0267]
paths: [web/src/features/admin/grants, web/src/features/admin/groups]
review_rounds: 0
---

## Goal
Close the gaps the CP4.5a UX parity pass (T-0267) found, so the CP4.5a rows in `ocp-parity.md` reach `match`.
Item 1 blocks QG-5; items 2-4 are small parity/clarity fixes on the same screens.

## Scope
- In: the four findings below (one line each: screen — problem — OCP reference — fix).
- Out: the `—` → `-` placeholder sweep and the details tab-panel name (T-0270).

## Contract / design notes
1. **(blocking)** Cluster Access tab (`/admin/clusters/:n/access`) — at 1280 the "Access mode" (106px) and "Priority"
   (72px) headers truncate to "Access mo…"/"Priori…" (UX.md §5: headers are never truncated at 1280) — OCP
   `public/components/RBAC/bindings.tsx:useRoleBindingsColumns` (L89-134) sets `modifier: 'nowrap'` on every data
   column — add 'Access mode' and 'Priority' to `NOWRAP_GRANT_COLUMNS` (the Credential column wraps and absorbs the
   width); if the table then overflows at 1280, hide Granted below 2xl with `LOW_PRIORITY_COLUMN`. At 1920 nothing truncates today.
2. Group details (`/admin/groups/:g`) — "Users" is inside the same section as "Group details", so there is no top
   border and no section padding between them — OCP `public/components/group.tsx:GroupDetails` (L199-218) renders two
   `PaneBody`s; `public/style/_common.scss` `.co-m-pane__body + .co-m-pane__body { border-top: 1px solid
   --pf-t--global--border--color--default }` — render both as sibling `DetailsSubsection`s (as `EffectiveAccessTab` does).
3. Group bulk wizard, Review step — the summary reads "Read only access to 2 clusters." and never states the priority
   chosen on step 2 (GPG-3: one priority for all clusters) — no OCP counterpart (fleet wizard); OCP review steps
   restate every chosen value — for group subjects append it: "Read only access with priority 10 to 2 clusters."
   (user subjects unchanged).
4. Grant access modal (cluster Access tab) — 56px gap between Subject name and Credential vs 24px elsewhere: PF adds
   `--pf-v6-c-form__section--MarginBlockStart` (32px) to a `FormGroup` that follows a `FormSection` — OCP
   `bindings.tsx` (L640-729) puts every group of the form inside a titled `FormSection` ("Role", "Subject"), so the
   gap is always section spacing — wrap Credential + Access mode in `FormSection title="Access" titleElement="h2"`
   (same `titleElement` as Subject), or, if the PO prefers no second heading, move Subject below them. No custom CSS.

## Context pack
- Docs: `UX.md` §5 (headers), §6 (sections), §8 (forms), §9 (wizards).
- Touch points: `web/src/features/admin/grants/GrantRow.tsx:NOWRAP_GRANT_COLUMNS` (L41-42), `GrantRow.tsx` column
  sets L24-30; `web/src/shared/table/columnVisibility.ts:LOW_PRIORITY_COLUMN`;
  `web/src/features/admin/groups/GroupDetailsTab.tsx` (SectionHeading L82, L95);
  `web/src/shared/ui/page/DetailsSubsection.tsx` (exemplar: `effective-access/EffectiveAccessTab.tsx` L101);
  `web/src/features/admin/grants/bulk/ReviewStep.tsx` L143; `web/src/features/admin/grants/GrantFormModal.tsx`
  L268-290 (`SubjectSection`, Credential, `accessMode` field).
- Measured (mock, 1280 light): table 894px wide; th padding `12px 28px 8px 16px`, td `8px 16px` (compact, same as
  every list); FormSection title h2 16px/600; form gap 24px; modal `medium` 840px; wizard modal `large` 1120px,
  nav 250px (`--pf-v6-c-wizard__nav--lg--Width` 15.625rem), body padding 24px, title 28px/600 (PF defaults, which OCP keeps).

## Acceptance criteria
- [ ] Probe at 1280: no Access tab header has `scrollWidth > clientWidth`; at 1920 unchanged.
- [ ] Group details: "Users" section starts after a 1px top border, like Cluster details' further sections.
- [ ] Group bulk wizard review states the priority; user bulk wizard review text unchanged.
- [ ] Grant modal: equal spacing between the subject fields and the access fields (no lone 56px gap).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
