---
id: T-0110
title: OCP page building blocks — PageHeading, DetailsGrid, StatusIconText, page tabs, filled content
status: todo
owner: frontend-engineer
checkpoint: CP3.5
depends_on: []
paths: [web/src/shared/ui/page, web/src/shared/ui/StatusIconText.tsx, web/src/shared/ui/index.ts, web/src/shared/ui/pageBlocks.test.tsx, web/src/app/layout/AppShell.tsx]
review_rounds: 0
---

## Goal
Give every later CP3.5 task the same OCP-shaped building blocks so pages stop hand-rolling headers, tabs and detail
lists. This task builds them (with unit tests) and switches the shell to a filled content area; adopting them on
pages is T-0111…T-0116. **Must merge first**: every other CP3.5 task depends on it.

## Scope
- In: `shared/ui` components below; `AppShell` `isContentFilled`; exports in `shared/ui/index.ts`.
- Out: using them on feature pages (later tasks), masthead/sidebar changes (T-0111).

## Contract / design notes
Visual rules: `docs/architecture/UX.md` §3, §4, §5 (status), §6. **ADR-0031: compose from `@patternfly/react-core`;
no `@patternfly/react-component-groups`, no new dependency.** New files under `web/src/shared/ui/page/` (one component
per file, colocated `*.module.css` only where a rule is not a PF prop, each rule commented with the OCP behaviour) and
`shared/ui/StatusIconText.tsx`; all exported from `shared/ui/index.ts`. Props mirror component-groups `PageHeader`:
- `PageHeading(props: { title: ReactNode; breadcrumbs?: BreadcrumbCrumb[]; icon?: ReactNode; status?: ReactNode;
  labels?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; alert?: ReactNode })` with
  `type BreadcrumbCrumb = { label: string; to?: string }` (last crumb without `to` = current page,
  `isActive`). Renders `PageSection` (`hasBodyWrapper={false}`) → `Breadcrumb` of router links (copy
  `ResourceHeader.tsx:ResourceBreadcrumb`, `BreadcrumbItem render={({className}) => <Link …/>}`) → `Flex`
  row (`justifyContent spaceBetween`, `flexWrap wrap`, gap `md`): left `[icon] <Title headingLevel="h1">` + status +
  labels, right actions → subtitle (`Content component="p"`) → alert. `title` is the only `h1` on the page.
  `icon` takes the existing kind badge (`features/resources/components/KindBadge.tsx:KindBadge`) — the feature passes it in, shared
  code never knows kinds.
- `PageTabs(props: { tabs: { key: string; title: string; to: string }[]; activeKey: string; 'aria-label': string })`
  — `Tabs component="nav" usePageInsets mountOnEnter` with `TabTitleText`, each `Tab href={to}` + router navigation
  (copy `ResourceDetailsPage.tsx:ResourceTabs` `onSelect` → `navigate` handling; keep `href` so middle-click works); no padded `PageSection` around it. Content is
  rendered by the route `<Outlet/>` below, not by `Tab` children.
- `PageBody({ children, isFilled? })` — padded content section under tabs/heading (OCP `PaneBody`) = `PageSection
  isFilled={isFilled}`; YAML editor and empty states pass `isFilled` to stretch.
- `SectionHeading({ text, id? })` — `Title headingLevel="h2" size="lg"` with bottom margin (OCP `headings.tsx`).
- `DetailsGrid({ children })` → `Grid hasGutter`; `DetailsColumn({ children })` → `GridItem sm={6}` + vertical
  `DescriptionList` (never `isHorizontal`); `DetailsItem({ label, children, 'data-testid'? })` →
  `DescriptionListGroup`/`Term`/`Description`.
- `StatusIconText(props: { status: StatusKind; text: string; asLabel?: boolean })`,
  `type StatusKind = 'success' | 'danger' | 'warning' | 'info' | 'pending' | 'neutral'` (exported). Icons
  `CheckCircleIcon`/`ExclamationCircleIcon`/`ExclamationTriangleIcon`/`InfoCircleIcon`/`HourglassHalfIcon`/none;
  colour via PF `Icon status=` (success/danger/warning/info — uses `--pf-t--global--icon--color--status--*`) not
  hand-written CSS; icon `aria-hidden`, text always visible. `asLabel` → `Label variant="outline" isCompact
  icon={…}`. Feature code maps its own enums to `StatusKind` (shared code stays feature-free).
- `AppShell`: `Page isContentFilled` (main container fills the viewport; children opt into stretching via
  `PageBody isFilled`).
- Do **not** change `NotFoundPage`, `ConfirmModal`, `EnvironmentLabel` here (T-0116 / T-0111 own them).

## Context pack
- Docs: `docs/architecture/UX.md` §2–§6; `FRONTEND.md` § "UI conventions" (updated for CP3.5).
  ADR-0031; FRONTEND.md § "Testing" (RTL `render` + roles; no full-app render needed — pure components, wrap
  in `MemoryRouter` for links, see `shared/ui/uiKit.test.tsx` L1-30 for the shared-ui test style).
- Exemplars to fold in: `web/src/features/resources/details/ResourceHeader.tsx:ResourceBreadcrumb` (L29-63, router
  crumbs) and `ResourceHeader` (L65-88, title row), `web/src/features/admin/users/UserDetailHeader.tsx:UserBreadcrumb`,
  `web/src/features/resources/details/ResourceDetailsPage.tsx:ResourceTabs` (L176-216, URL-bound tabs).
- Touch points: `web/src/app/layout/AppShell.tsx:AppShell` (L13-28, add `isContentFilled`), `web/src/shared/ui/index.ts`
  (export block, alphabetical).
- Conflicts: none while running (first task). `AppShell.tsx` is later touched by T-0111.
- PF: `Page.isContentFilled`, `Tabs.usePageInsets`/`component`, `DescriptionList`, `Grid`, `Label variant="outline" icon`.
- OCP: `packages/console-shared/src/components/heading/PageHeading.tsx`, `public/components/utils/horizontal-nav.tsx`
  (L196 `Tabs component="nav" usePageInsets`), `public/components/utils/details-item.tsx`,
  `public/components/utils/headings.tsx`, `packages/console-dynamic-plugin-sdk/src/app/components/status/StatusIconAndText.tsx`.

## Acceptance criteria
- [ ] Every existing page's white content card reaches the bottom of the viewport at 1280×900 and 1920×1080, both themes.
- [ ] `PageHeading` renders breadcrumb, h1, status/labels and right-aligned actions on one row at 1280; actions wrap
      below the title (not over it) at narrow widths.
- [ ] `PageTabs` first tab text starts at the same x as the h1 text (no 20 px offset as today on `/admin/users/alice`).
- [ ] `DetailsGrid` shows two columns ≥ 576 px, one below; terms sit above values.
- [ ] `StatusIconText` icons use status tokens and stay readable in dark theme (contrast ≥ 3:1 for the icon).
- [ ] Unit tests in `shared/ui/pageBlocks.test.tsx` for each component (one h1, breadcrumb link targets + current
      crumb, actions in the heading, active tab `aria-current="page"`, `StatusIconText` text visible + icon hidden from AT,
      `asLabel` renders a label). Existing `AppShell.test.tsx` stays green unchanged.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
