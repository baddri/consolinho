import {
  Divider,
  Flex,
  FlexItem,
  Label,
  Menu,
  MenuContainer,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuList,
  MenuSearch,
  MenuSearchInput,
  MenuToggle,
  SearchInput,
  Skeleton,
  Title,
  Tooltip,
  Truncate,
} from '@patternfly/react-core';
import { ClusterIcon, GlobeIcon } from '@patternfly/react-icons';
import { Fragment, type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useCurrentUser } from '@/features/auth';
import type { AccessibleCluster } from '@/shared/api';
import { FLEET_PATH, usePerspective } from '@/shared/routing';
import {
  ClusterTypeIcon,
  ClusterTypeLabel,
  clusterTypeText,
  EnvironmentLabel,
  environmentLabel,
} from '@/shared/ui';
import { useClusterSwitcherOpenRequest } from './clusterSwitcherRequest';
import { clusterSwitchPath } from './clusterSwitchPath';
import { NoMatchStatus } from './NoMatchStatus';
import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';
import { useRecentClusters } from './useRecentClusters';
import { useShownCluster } from './useShownCluster';
import {
  buildSwitcherSections,
  FLEET_ITEM_ID,
  focusOrder,
  matchingClusters,
  nextFocusKey,
  RETRY_ITEM_ID,
  type SwitcherRow,
  type SwitcherSection,
} from './switcherRows';

/** Toggle text in the fleet perspective, also the start of its accessible name (FLEET-2). */
const FLEET_TITLE = 'Fleet management';

/**
 * Labels after the cluster's display name, in UX.md §2a order (SW-5): type tag (`OCP`/`K8s`), environment and — in
 * the menu only, for an effective read-only mode (contract §6) — "Read only". The toggle stays one line, so it drops
 * "Read only" (its accessible name still says it, SW-4).
 */
function ClusterLabels({ cluster, placement }: { cluster: AccessibleCluster; placement: 'menu' | 'toggle' }) {
  return (
    <>
      <FlexItem>
        <ClusterTypeLabel distribution={cluster.distribution} />
      </FlexItem>
      <FlexItem>
        <EnvironmentLabel environment={cluster.environment} isCompact />
      </FlexItem>
      {placement === 'menu' && cluster.accessMode === 'readOnly' && (
        <FlexItem>
          <Label isCompact>Read only</Label>
        </FlexItem>
      )}
    </>
  );
}

/** Menu item content: display name then labels on one line; a long name truncates (full name in a tooltip). */
function ClusterBadges({ cluster }: { cluster: AccessibleCluster }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
      <FlexItem flex={{ default: 'flex_1' }} className="pf-v6-u-min-width">
        <Truncate content={cluster.displayName} />
      </FlexItem>
      <ClusterLabels cluster={cluster} placement="menu" />
    </Flex>
  );
}

/**
 * Toggle content on one line like OCP's perspective switcher (`NavHeader.tsx`): the display name as `Title h2
 * size="md"`, the type and environment labels inline after it. The title itself shrinks and clips with an ellipsis
 * (`pf-v6-u-text-truncate`), so the gap before the labels stays; the full name is in the toggle's accessible name,
 * its tooltip and the menu.
 */
function ToggleContent({ cluster }: { cluster: AccessibleCluster }) {
  return (
    <Flex
      spaceItems={{ default: 'spaceItemsSm' }}
      flexWrap={{ default: 'nowrap' }}
      alignItems={{ default: 'alignItemsCenter' }}
      className="pf-v6-u-min-width pf-v6-u-text-align-start"
    >
      <FlexItem flex={{ default: 'flex_1' }} className="pf-v6-u-min-width">
        <Title headingLevel="h2" size="md" className="pf-v6-u-text-truncate">
          {cluster.displayName}
        </Title>
      </FlexItem>
      <ClusterLabels cluster={cluster} placement="toggle" />
    </Flex>
  );
}

/**
 * Accessible name of the switcher toggle (SW-4). It replaces the visible content for screen readers, so it names the
 * cluster (when the display name differs), the type and environment tags and the read-only mode the toggle doesn't
 * show, e.g. "Cluster Prod EU West (prod-eu-1, OCP, prod, read only), switch cluster".
 */
function toggleLabel(cluster: AccessibleCluster): string {
  const cues = [clusterTypeText(cluster.distribution).tag, environmentLabel(cluster.environment).text];
  if (cluster.displayName !== cluster.name) cues.unshift(cluster.name);
  if (cluster.accessMode === 'readOnly') cues.push('read only');
  return `Cluster ${cluster.displayName} (${cues.join(', ')}), switch cluster`;
}

/** Accessible name of the toggle per perspective: the fleet, the shown cluster or a prompt. */
function toggleAccessibleName(isFleet: boolean, shown: AccessibleCluster | undefined): string {
  if (isFleet) return `${FLEET_TITLE}, switch cluster`;
  return shown ? toggleLabel(shown) : 'Select a cluster';
}

/**
 * One selectable cluster (SW-1, SW-3): type icon, display name as main text and the cluster name as PF `description`
 * when it differs; `itemId` stays the cluster name.
 */
function ClusterItem({
  cluster,
  id,
  isFocused,
}: {
  cluster: AccessibleCluster;
  id: string;
  isFocused: boolean;
}) {
  return (
    <MenuItem
      itemId={cluster.name}
      id={id}
      isFocused={isFocused}
      icon={<ClusterTypeIcon distribution={cluster.distribution} />}
      description={cluster.displayName !== cluster.name ? cluster.name : undefined}
    >
      <ClusterBadges cluster={cluster} />
    </MenuItem>
  );
}

/**
 * Sidebar context selector — FleetConsole's counterpart of OCP's perspective switcher (UX.md §2): a full-width toggle
 * at the top of the nav, its menu opening below exactly as wide as the toggle. It switches the active cluster by
 * rewriting the URL (see {@link clusterSwitchPath}: path and filters are kept, SW-9); navigation only (SW-2). Built on PF `MenuContainer` + `Menu` (role `listbox`):
 *
 * - each cluster shows its type icon, display name (cluster name as description or toggle tooltip when it differs) and
 *   `OCP`/`K8s` + environment tags; the toggle stays one line without "Read only" (SW-1..5);
 * - a search box, focused on open, filters by name, display name, environment and type (`ocp`, `kubernetes`, …);
 *   Enter opens the first match (SW-6, SW-7);
 * - keyboard (T-0153, PF typeahead pattern): focus stays in the search box (a `combobox`); ArrowUp/ArrowDown move
 *   `aria-activedescendant` over the rows of {@link buildSwitcherSections} and wrap, Enter opens the focused row;
 * - a "Recent" group from {@link useRecentClusters} above "All clusters" (contract order), hidden while searching,
 *   when empty (SW-8), when it would list every cluster again or only the shown cluster.
 *
 * Like OCP's `NavHeader` it is also the perspective switcher (ADR-0033 §6): admins (read-only admins too) get a
 * "Fleet management" entry first, above a divider and independent of the search, which leads to `/fleet` (FLEET-1/2).
 * In the fleet perspective (`/fleet/...`, for everyone) the toggle shows the globe icon and "Fleet management" and
 * that entry is selected; choosing a cluster goes to its root via {@link clusterSwitchPath} (FLEET-5).
 *
 * In the cluster perspective the toggle shows the active cluster (its type icon in PF's `icon` slot); outside a cluster (e.g. Preferences) it shows
 * {@link usePreferredCluster} — the cluster the sidebar links target — and that cluster is marked selected; both via
 * {@link useShownCluster}, which the Kubernetes shell theme follows too (THEME-1), so toggle and theme agree.
 *
 * States (cluster perspective): loading → skeleton in a disabled toggle; error without cached data → "Clusters
 * unavailable — retry" toggle whose click refetches; empty → disabled "No clusters" toggle (SW-4). Admins skip the
 * error and empty toggles ("Select a cluster" instead), so Fleet management stays reachable; in the fleet perspective
 * the toggle never waits for the list. Then the menu says why it lists no clusters and offers a retry row.
 */
export function ClusterSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const baseId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeCluster = useActiveCluster();
  const shown = useShownCluster();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: clusters, error, refetch } = useAccessibleClusters();
  const { recent } = useRecentClusters();
  const isFleet = usePerspective() === 'fleet';
  const isAdmin = useCurrentUser().data?.role === 'admin';

  // "Select a cluster" on the not-available page opens this menu (T-0097).
  useClusterSwitcherOpenRequest(useCallback(() => setIsOpen(true), []));

  // Focus the search box once the popper has rendered the menu (same deferral PF uses for its own open focus).
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Admins and the fleet perspective always get the menu: it holds the way into the fleet area (FLEET-1).
  const needsClusters = !isFleet && !isAdmin;
  // First load only: while the menu is open (an admin's retry refetches with `error` reset and `data` still empty,
  // TanStack v5 `pending`) the menu stays mounted and its row reads "Loading clusters".
  if (!isFleet && !clusters && !error && !isOpen) {
    // The skeleton's screen-reader text is the toggle's accessible name.
    return (
      <MenuToggle isFullWidth isDisabled>
        <Skeleton width="8rem" screenreaderText="Loading clusters" />
      </MenuToggle>
    );
  }
  if (needsClusters && !clusters) {
    return (
      <MenuToggle isFullWidth status="danger" onClick={() => void refetch()}>
        Clusters unavailable — retry
      </MenuToggle>
    );
  }
  if (needsClusters && clusters?.length === 0) {
    return (
      <MenuToggle isFullWidth isDisabled icon={<ClusterIcon />}>
        No clusters
      </MenuToggle>
    );
  }

  const needle = searchText.trim().toLowerCase();
  const sections = buildSwitcherSections({
    isAdmin,
    clusters,
    hasError: error !== null,
    recent,
    shownName: shown?.name,
    searchText,
  });
  const matches = matchingClusters(sections);
  const order = focusOrder(sections);
  // A key whose row disappeared (filter, refetch) simply counts as "nothing focused".
  const focused = order.find((row) => row.key === focusedKey);
  const rowId = (row: SwitcherRow) => `${baseId}-${row.key}`;
  const listId = (section: SwitcherSection) => `${baseId}-list-${section.id}`;

  const changeOpen = (open: boolean) => {
    setIsOpen(open);
    setFocusedKey(null);
    if (!open) setSearchText('');
  };

  // Typing resets the active option (WAI-ARIA APG combobox).
  const changeSearch = (value: string) => {
    setSearchText(value);
    setFocusedKey(null);
  };

  const choose = (name: string) => {
    if (name === RETRY_ITEM_ID) {
      // Stay open, focus back in the search box: the retry row is replaced by "Loading clusters", then the list.
      searchRef.current?.focus();
      void refetch();
      return;
    }
    changeOpen(false);
    toggleRef.current?.focus();
    if (name === FLEET_ITEM_ID) {
      if (!isFleet) void navigate(FLEET_PATH);
    } else if (name !== activeCluster) {
      void navigate(clusterSwitchPath(location, name));
    }
  };

  /** One row as a PF `MenuItem`; `isFocused` drives PF's `pf-m-focus` and scroll-into-view (DOM focus stays in the search). */
  const renderRow = (row: SwitcherRow) => {
    const rowProps = { id: rowId(row), isFocused: row.key === focused?.key };
    switch (row.kind) {
      case 'fleet':
        return (
          <MenuItem key={row.key} itemId={row.itemId} icon={<GlobeIcon />} {...rowProps}>
            {FLEET_TITLE}
          </MenuItem>
        );
      case 'cluster':
        return <ClusterItem key={row.key} cluster={row.cluster} {...rowProps} />;
      case 'retry':
        return (
          <MenuItem key={row.key} itemId={row.itemId} {...rowProps}>
            Clusters unavailable — retry
          </MenuItem>
        );
      case 'status':
        return (
          <MenuItem key={row.key} isDisabled>
            {row.text}
          </MenuItem>
        );
    }
  };

  const renderSection = (section: SwitcherSection) => {
    const list = (
      <MenuList id={listId(section)} aria-label={section.ariaLabel}>
        {section.rows.map(renderRow)}
      </MenuList>
    );
    return section.groupLabel ? (
      <MenuGroup label={section.groupLabel} labelHeadingLevel="h3">
        {list}
      </MenuGroup>
    ) : (
      list
    );
  };

  // Typeahead pattern (PF `SelectTypeahead`): DOM focus stays in the search box, the arrows move a React-state focus.
  const onSearchKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedKey(nextFocusKey(order, focused?.key ?? null, event.key));
    } else if (event.key === 'Enter') {
      if (focused) choose(focused.itemId);
      else if (needle && matches[0]) choose(matches[0].name);
    }
  };

  const menu = (
    <Menu
      ref={menuRef}
      role="listbox"
      selected={isFleet ? FLEET_ITEM_ID : shown?.name}
      // PatternFly types item ids as `any`; accept `unknown` and narrow.
      onSelect={(_event, itemId: unknown) => {
        if (typeof itemId === 'string') choose(itemId);
      }}
      isScrollable
    >
      <MenuSearch>
        <MenuSearchInput>
          <SearchInput
            ref={searchRef}
            aria-label="Search clusters"
            placeholder="Search clusters"
            value={searchText}
            onChange={(_event, value) => changeSearch(value)}
            onClear={() => changeSearch('')}
            // Combobox semantics go on the <input> itself; SearchInput's top-level aria-* land on its wrapper.
            inputProps={{
              role: 'combobox',
              // The input only exists while the menu is open.
              'aria-expanded': true,
              'aria-autocomplete': 'list',
              'aria-controls': sections.map(listId).join(' '),
              'aria-activedescendant': focused ? rowId(focused) : undefined,
            }}
            // No `onSearch`: it would add a submit ("→") button that OCP's menu search doesn't have. Enter opens the
            // focused row, else the first match (SW-7); the key event bubbles from the input to the wrapper.
            onKeyDown={onSearchKeyDown}
          />
        </MenuSearchInput>
        <NoMatchStatus
          text={needle && matches.length === 0 ? `No clusters match "${searchText.trim()}"` : undefined}
        />
      </MenuSearch>
      <Divider />
      <MenuContent maxMenuHeight="60vh">
        {sections.map((section, index) => (
          <Fragment key={section.id}>
            {index > 0 && <Divider />}
            {renderSection(section)}
          </Fragment>
        ))}
      </MenuContent>
    </Menu>
  );

  // The toggle's title truncates, so like PF `Truncate` its tooltip holds the full display name, with the cluster
  // name on a second line when it differs. PF `triggerRef` keeps the toggle unwrapped.
  const tooltip = shown && (
    <>
      <div>{shown.displayName}</div>
      {shown.displayName !== shown.name && <div>{shown.name}</div>}
    </>
  );

  return (
    <>
      <MenuContainer
        isOpen={isOpen}
        onOpenChange={changeOpen}
        menu={menu}
        menuRef={menuRef}
        toggleRef={toggleRef}
        // The popper is appended to <body>, so the sidebar's overflow never clips it.
        // Exactly the toggle's width, like OCP's perspective menu: search text and long names never widen it past the
        // sidebar edge (T-0152); long display names truncate with a tooltip instead (`ClusterBadges`).
        popperProps={{ width: 'trigger' }}
        toggle={
          <MenuToggle
            ref={toggleRef}
            isFullWidth
            icon={
              isFleet ? (
                <GlobeIcon />
              ) : shown ? (
                <ClusterTypeIcon distribution={shown.distribution} />
              ) : (
                <ClusterIcon />
              )
            }
            onClick={() => changeOpen(!isOpen)}
            isExpanded={isOpen}
            aria-label={toggleAccessibleName(isFleet, shown)}
          >
            {isFleet ? (
              <Title headingLevel="h2" size="md">
                {FLEET_TITLE}
              </Title>
            ) : shown ? (
              <ToggleContent cluster={shown} />
            ) : (
              'Select a cluster'
            )}
          </MenuToggle>
        }
      />
      {/* `aria="none"`: both names are already in the toggle's accessible name. */}
      {tooltip && <Tooltip content={tooltip} triggerRef={toggleRef} aria="none" />}
    </>
  );
}
