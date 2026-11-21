# 0031 — OCP page building blocks are composed from react-core, not `@patternfly/react-component-groups`
**Status:** Accepted (2026-11-21) · builds on ADR-0029 (CSP) · CP3.5 `UX.md` §3–§6; T-0110

## Context
CP3.5 makes every page look like the OpenShift console. `UX.md` §3 points at OCP's `PageHeading`, which renders the
component-groups `PageHeader` layout (breadcrumb → [icon] h1 + label → actions right → subtitle). We need a shared
heading, page tabs, a two-column details grid and icon + text statuses. Option A: add
`@patternfly/react-component-groups` (6.7.0 = our pinned PF 6.7.0; peers `react ^17–19`, actively released by the PF
team). Option B: compose the same layout from `@patternfly/react-core` parts we already ship.

## Decision
**Option B.** `shared/ui` owns `PageHeading`, `PageTabs`, `DetailsGrid`/`DetailsColumn`/`DetailsItem`,
`SectionHeading` and `StatusIconText`, built only from react-core (`PageSection`, `Breadcrumb`, `Flex`, `Title`,
`Tabs`, `Grid`, `DescriptionList`, `Label`) + react-icons + PF tokens. Prop names mirror component-groups `PageHeader`
(`title`, `subtitle`, `icon`, `breadcrumbs`, `actionMenu`→`actions`) plus the slots OCP adds (`status`, `labels`, `alert`), so a
later switch is a mechanical change inside `PageHeading` only.

Why not A:
- **Runtime CSS-in-JS:** component-groups depends on `react-jss`, which injects `<style>` elements at runtime. That
  works under today's `style-src 'unsafe-inline'` (ADR-0029), but adds a second reason to keep that relaxation,
  which exists only for Monaco and should be removable once Monaco can be nonce'd.
- **Extra dependency tree:** a required peer `@patternfly/react-drag-drop` (pulls `@dnd-kit/*`) and `react-jss`
  (JSS runtime), for one ~60-line layout component. Versions float on `^6.6.2` against our exact PF pins.
- **Slot mismatch:** `PageHeader` has one `label` slot and no alert/status distinction; OCP's heading needs status
  + category labels + alert, so we would wrap and partly re-implement it anyway.

## Consequences
- No new npm dependency; `web/package.json` unchanged by T-0110. Bundle and CSP unchanged.
- We own a small amount of layout code; each rule that is not a PF prop is a colocated CSS module rule commented with
  the OCP behaviour it reproduces (`UX.md` §1).
- Revisit if we adopt several component-groups pieces (e.g. `BulkSelect`, `ErrorState`) or it drops `react-jss`.
