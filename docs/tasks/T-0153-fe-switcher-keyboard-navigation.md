---
id: T-0153
title: Keyboard navigation from the switcher search into its menu items
status: done
owner: frontend-engineer
checkpoint: 3.7
depends_on: [T-0145]
paths: [web/src/features/cluster-context/]
review_rounds: 0
---

## Goal
From the T-0145 reviews. When the switcher menu opens, focus is in the search box. ArrowDown does nothing, and Tab leaves
the menu, so keyboard users can't reach "Fleet management" or any cluster except by typing and pressing Enter. In
T-0145 round 1 the engineer built a hand-rolled typeahead (`useTypeaheadFocus`). It was removed in round 3, because no
AC or design covered it and it duplicated the row order by hand. This task does it properly. It must be done before
CP3.7 VERIFY, because it is the keyboard route to the fleet perspective.

## Scope
- In: a row model shared by rendering and focus order; combobox semantics on the search input; ArrowUp/ArrowDown/Enter.
- Out: Home/End/PageUp/PageDown (the input keeps them for the caret), type-to-select, hover-syncs-focus, menu width (T-0152).

## Contract / design notes
**What PF6 (6.7.0) gives for free, and what it doesn't**
- `Menu` mounts a `KeyboardHandler` (`Menu.js` `createNavigableElements`) that roves DOM focus over the menu's `<li>`s with
  ArrowUp/Down and wraps. `MenuSearch` is a `<div>`, not an `<li>`, so it is **not** in that list. ArrowDown in the search
  box finds no active row and does nothing. That is the bug. PF's own `MenuFilteringWithSearchInput` example has the same gap.
- `MenuContainer` closes the menu and refocuses the toggle on `onOpenChangeKeys` (default `['Escape','Tab']`). The Escape
  AC is already met; keep the default. Tab closing the menu is correct combobox behaviour (WAI-ARIA APG).
- PF's answer for "an input drives a list" is the **typeahead pattern** (`react-core/src/components/Select/examples/SelectTypeahead.tsx`
  `handleMenuArrowKeys`/`onInputKeyDown`, L117-185). DOM focus stays in the input. React state holds the focused option.
  Each option gets `isFocused` (PF adds `pf-m-focus` and scrolls it into view itself, `MenuItem.js` L205-217) and an `id`
  (it lands on the `role="option"` button). The input gets `aria-activedescendant`. Use this pattern: it is all React
  state, needs no refs to rows and no DOM calls, and typing keeps filtering.
- No conflict with the Menu's KeyboardHandler. It listens on `window`, so our React `onKeyDown` runs first. With focus in
  the input it matches no `<li>` and does nothing.

**How OCP does it.** `packages/console-app/src/components/nav/NavHeader.tsx` (the perspective switcher) is a plain PF `Select`
with no search, so PF's roving focus is enough there. `packages/console-shared/src/components/namespace/NamespaceDropdown.tsx`
(`Filter`, L70-93; `Menu`, L297-330) has a `MenuSearch` + `TextInput` and no key handling of its own. There, Tab reaches the
first row only because it doesn't use `MenuContainer`. We keep `MenuContainer` (Tab closes), so the visuals follow OCP
and the keyboard behaviour follows PF's typeahead example.

**One source: `web/src/features/cluster-context/switcherRows.ts` (new, pure, no React)**
```ts
export type SwitcherRow =
  | { kind: 'fleet'; key: string; itemId: typeof FLEET_ITEM_ID }
  | { kind: 'cluster'; key: string; itemId: string; cluster: AccessibleCluster }
  | { kind: 'retry'; key: string; itemId: typeof RETRY_ITEM_ID }
  | { kind: 'status'; key: string; text: string };            // disabled, never focusable
export interface SwitcherSection { id: 'fleet' | 'recent' | 'all'; ariaLabel: string; groupLabel?: string; rows: SwitcherRow[] }
export function buildSwitcherSections(input: {
  isAdmin: boolean; clusters: readonly AccessibleCluster[] | undefined; hasError: boolean;
  recent: readonly AccessibleCluster[]; shownName: string | undefined; searchText: string;
}): SwitcherSection[];
/** Focusable rows in render order: every row except `status`. */
export function focusOrder(sections: readonly SwitcherSection[]): SwitcherRow[];
/** Next focused key for ArrowUp/ArrowDown; wraps at both ends; `null` current → first (Down) / last (Up); `null` if none focusable. */
export function nextFocusKey(order: readonly SwitcherRow[], current: string | null, key: 'ArrowUp' | 'ArrowDown'): string | null;
```
- Move `FLEET_ITEM_ID`, `RETRY_ITEM_ID`, `matchesSearch`, `clusterListStatus` and the `showRecent`/`showRetry` logic
  (`ClusterSwitcher.tsx` L35-42, L114-137, L225-235) into it unchanged. `groupLabel` is set ("Recent", "All clusters") only
  when the recent section exists, as today.
- **`key` is `${section.id}:${cluster.name}`**, not the item id. A cluster can be in both Recent and All clusters, so
  `itemId` (the cluster name) is not unique. The same `key` is the React `key`, the focus state and, prefixed with
  `useId()`, the DOM `id`.
- The component renders **only** from `sections`: one `MenuList` per section (with `MenuGroup` when there is a
  `groupLabel`) and `Divider`s between sections. The DOM must stay the same as today, and the existing tests prove that.
  Enter-on-first-match uses the first `cluster` row of the `all` section.

**Component state and keys (`ClusterSwitcher`)**
- `const [focusedKey, setFocusedKey] = useState<string | null>(null)`. Derive `focused = order.find(r => r.key === focusedKey)`
  each render. A key that has disappeared (filter or refetch) then counts as "none", so no reset effect is needed. Also clear it
  in `changeOpen` and on search `onChange`/`onClear`, as the APG says typing resets the active option.
- Search `onKeyDown` (on the existing prop, L294-297): `ArrowDown`/`ArrowUp` → `preventDefault()` and
  `setFocusedKey(nextFocusKey(...))`; `Enter` → `choose(focused.itemId)` if a row is focused, otherwise today's first-match
  rule. Space is **not** a select key here: in an editable combobox it types a space (APG). The AC below is amended to match.
- Ends **wrap** (same as PF's KeyboardHandler and the SelectTypeahead example). Disabled `status` rows are skipped
  because they are not in `focusOrder`.
- `ClusterItem` (L140-149) gets `id` and `isFocused` props. The Fleet and Retry `MenuItem`s get the same props.

**A11y (UX round 2), all on the `<input>` through `SearchInput`'s `inputProps`.** The top-level `aria-*` props of `SearchInput`
go to the wrapper; `TextInputGroupMain` spreads `inputProps` onto the input.
`role: 'combobox'`, `'aria-expanded': true` (the input only exists while the menu is open), `'aria-autocomplete': 'list'`,
`'aria-controls'`: the space-separated ids of the rendered `MenuList`s (each `ul` is a `role="listbox"`; ids are
`${baseId}-list-${section.id}`, from `sections`), and `'aria-activedescendant'`: the focused row's DOM id, **omitted** when
nothing is focused. `aria-label="Search clusters"` stays as it is. Each row's `role="option"`/`aria-selected` comes from PF.

**Tests.** Because of the role change, `getByRole('textbox', { name: 'Search clusters' })` becomes `'combobox'` at
`clusterContext.test.tsx` L150, L216, L347, L450. The `tableKit.test.tsx` hits are a different input; leave them alone.
- `switcherRows.test.ts` (new): section order (fleet → recent → all), duplicate cluster keys are unique, status rows are
  not focusable, `nextFocusKey` from null/first/last in both directions, and the empty order.
- `clusterContext.test.tsx`, new `describe('ClusterSwitcher keyboard (T-0153)')` next to the SW-7 block (L144-225),
  using the same `renderApp`/user setup: as admin, ArrowDown → the input's `aria-activedescendant` is the Fleet
  management option's id and that option's `li` has `pf-m-focus`; ArrowDown again → first cluster; ArrowUp from Fleet wraps to the last cluster;
  Enter on a focused cluster navigates there; typing after an arrow clears `aria-activedescendant`; Escape → toggle has focus.

## Context pack
- Docs: `FRONTEND.md` § UI conventions, § Testing; `UX.md` (switcher, §2)
- Exemplars: `node_modules/@patternfly/react-core/src/components/Select/examples/SelectTypeahead.tsx:L117-185,L205-260`
  (key handling and combobox attributes); `clusterContext.test.tsx:L144-225` (switcher keyboard test setup)
- Touch points, `web/src/features/cluster-context/ClusterSwitcher.tsx`: L21 (add `useId`); L35-42, L114-137 (move to
  model); L139-149 `ClusterItem` (+`id`, `isFocused`); L174-178 (state); L225-235 (→ `buildSwitcherSections`);
  L237-240 `changeOpen` (clear focus); L258-270 `allList` and L303-331 `MenuContent` body (render from sections);
  L285-298 `SearchInput` (`inputProps`, `onKeyDown`, clear focus on change/clear); L337-345 `MenuContainer` (unchanged).
  Update the component TSDoc (L151-172) with one line on the keyboard model.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-app/src/components/nav/NavHeader.tsx`
  (switcher), `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/namespace/NamespaceDropdown.tsx:Filter`
  (menu search)

## Acceptance criteria
- [x] From the search box, ArrowDown/ArrowUp reach every selectable row in render order (Fleet management first for
      admins) and wrap at the ends. Enter selects the focused row (with no focused row, today's first-match rule).
      Escape closes the menu and returns focus to the toggle. (Space types into the search, per the combobox pattern.)
- [x] Screen readers announce the focused row: the input is a `combobox` with `aria-expanded`, `aria-controls`,
      `aria-autocomplete="list"`, and its `aria-activedescendant` points at the focused `option` (verified in the probe). *Verified by RTL tests: the
      probe only navigates (never clicks/presses keys), so it can't open the menu.*
- [x] The focus order comes from the same `buildSwitcherSections` output that renders the rows (no parallel list).
- [x] Unit tests cover arrow movement, wrapping at both ends, skipped status rows, Enter, and the reset on typing.
- [ ] `scripts/check-fe.sh` passes (done, 860 tests); frontend-architect and ux-designer approve.

## Work log
- 2026-11-23 frontend-engineer: started; implementing the architect design (switcherRows.ts + typeahead keys).

- 2026-11-23 frontend-engineer: added `switcherRows.ts` (+tests); ClusterSwitcher renders from sections, typeahead keys
  and combobox attrs on the input; new keyboard describe block; `check-fe.sh` green. Probe skipped (can't open menus).

## Review
- 2026-11-23 frontend-architect, round 1: **APPROVE**. `check-fe.sh` green (76 files, 860 tests).
  - Design match: one `buildSwitcherSections` output drives `renderSection`/`renderRow` and `focusOrder`; combobox attrs via `inputProps`, `aria-activedescendant` omitted when none; wrap; `changeSearch`/`changeOpen` clear focus; Enter falls back to `matches[0]` only with a needle (SW-7 unchanged).
  - DOM: same lists/groups/dividers/labels/order as before; the only additions are the `MenuList`/row `id`s the design asks for. Existing switcher tests pass unchanged apart from textbox→combobox.
  - Deviation `focusOrder(): FocusableRow[]`: accepted. It is a subtype of the contract and lets Enter use `itemId` without a kind check.
  - Deviation `matchingClusters`: accepted. It derives from `sections` (no parallel list) and keeps the Enter and NoMatchStatus logic identical.
  - Deviation `scrollIntoView` stub: accepted (jsdom has no layout; PF calls it for `isFocused`).
  - Deviation AC2 verified by RTL instead of the probe: accepted. The tests assert the role, `aria-expanded`/`-controls`/`-autocomplete` and that `aria-activedescendant` resolves to the option. ux-designer still eyeballs `pf-m-focus` live.
  - Nit (optional): `clusterContext.test.tsx:228` sets the `scrollIntoView` stub in `beforeAll` and never restores it. Scope it with `vi.spyOn(Element.prototype, 'scrollIntoView')`, or restore it in `afterAll`.
- 2026-11-23 ux-designer, round 1: **APPROVE** (live mock UI, admin, 1280, light + dark; Playwright keyboard script).
- AC amendment (Space types into the search) is correct per WAI-ARIA editable combobox and PF `SelectTypeahead.tsx`; live: Space inserts " " and does not navigate. Closes my T-0145 round-2 finding.
- Highlight: ArrowDown sets `pf-m-focus` on the row `li`; background resolves to PF's own `--pf-v6-c-menu__list-item--hover--BackgroundColor` (same as hover/focus-within, `menu.css` L468); no custom CSS; visible in both themes.
- Combobox: input has `role=combobox`, `aria-expanded=true`, `aria-autocomplete=list`, `aria-controls` = ids of both rendered `role=listbox` `ul`s (Fleet, All clusters), `aria-activedescendant` = `role=option` button id, absent when nothing focused and cleared on typing; DOM focus stays in the input.
- Wrap and Escape verified live (ArrowUp from Fleet wraps to the last cluster; Escape returns focus to the toggle). Visuals still match OCP `packages/console-shared/src/components/namespace/NamespaceDropdown.tsx` (`Filter`).
- Note, not blocking: mouse hover on another row shows a second highlight next to `pf-m-focus` (same as PF's typeahead example; hover-syncs-focus is out of scope).

## Handover notes
- Model: `switcherRows.ts` (`buildSwitcherSections`, `focusOrder`, `nextFocusKey`, plus `matchingClusters` for the
  Enter-first-match rule and NoMatchStatus). `matchesSearch`/`clusterListStatus`/item ids moved there unchanged.
- `ClusterSwitcher` renders only from `sections` (`renderRow`/`renderSection`, Dividers between sections); DOM ids
  `${useId()}-${row.key}` and lists `${useId()}-list-${section.id}`; focus is `focusedKey` state, cleared on
  open/close and search change/clear; a vanished key derives to "none".
- `focusOrder` returns `FocusableRow[]` (narrower than the contract's `SwitcherRow[]`) so Enter needs no kind check.
- The keyboard tests stub `Element.prototype.scrollIntoView` (jsdom lacks it; PF calls it for `isFocused`).
- Fleet → `/fleet/admin/users` on Enter is covered too. UX should eyeball `pf-m-focus` styling in the live menu.
