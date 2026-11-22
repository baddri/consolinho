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
  Truncate,
} from '@patternfly/react-core';
import { ClusterIcon, GlobeIcon } from '@patternfly/react-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useCurrentUser } from '@/features/auth';
import type { AccessibleCluster } from '@/shared/api';
import { FLEET_PATH, usePerspective } from '@/shared/routing';
import { EnvironmentLabel, environmentLabel } from '@/shared/ui';
import { useClusterSwitcherOpenRequest } from './clusterSwitcherRequest';
import { clusterSwitchPath } from './clusterSwitchPath';
import { NoMatchStatus } from './NoMatchStatus';
import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';
import { usePreferredCluster } from './usePreferredCluster';
import { useRecentClusters } from './useRecentClusters';

/**
 * Menu item id of the "Fleet management" entry. `:` can't occur in a DNS-1123 cluster name, so it never collides
 * with a cluster's item id (ADR-0033 §6).
 */
const FLEET_ITEM_ID = 'fleet:management';

/** Menu item id of the "Clusters unavailable — retry" row; refetches instead of navigating. */
const RETRY_ITEM_ID = 'clusters:retry';

/** Toggle text in the fleet perspective, also the start of its accessible name (FLEET-2). */
const FLEET_TITLE = 'Fleet management';

/** Environment label and — for an effective read-only mode (contract §6) — a "Read only" label. */
function ClusterLabels({ cluster }: { cluster: AccessibleCluster }) {
  return (
    <>
      <FlexItem>
        <EnvironmentLabel environment={cluster.environment} isCompact />
      </FlexItem>
      {cluster.accessMode === 'readOnly' && (
        <FlexItem>
          <Label isCompact>Read only</Label>
        </FlexItem>
      )}
    </>
  );
}

/** Menu item content: name then labels on one line; a long name truncates (full name in a tooltip). */
function ClusterBadges({ cluster }: { cluster: AccessibleCluster }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
      <FlexItem flex={{ default: 'flex_1' }} className="pf-v6-u-min-width">
        <Truncate content={cluster.name} />
      </FlexItem>
      <ClusterLabels cluster={cluster} />
    </Flex>
  );
}

/**
 * Toggle content on one line like OCP's perspective switcher (`NavHeader.tsx`): the name as `Title h2 size="md"`,
 * the labels inline after it. The title itself shrinks and clips with an ellipsis (`pf-v6-u-text-truncate`), so the
 * gap before the labels stays; the full name is in the toggle's accessible name and in the menu.
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
          {cluster.name}
        </Title>
      </FlexItem>
      <ClusterLabels cluster={cluster} />
    </Flex>
  );
}

/**
 * Accessible name of the switcher toggle. It replaces the visible content for screen readers, so it repeats the
 * environment and read-only cues the labels show, e.g. "Cluster prod-eu-1 (prod, read only), switch cluster".
 */
function toggleLabel(cluster: AccessibleCluster): string {
  const cues = [environmentLabel(cluster.environment).text];
  if (cluster.accessMode === 'readOnly') cues.push('read only');
  return `Cluster ${cluster.name} (${cues.join(', ')}), switch cluster`;
}

/** Accessible name of the toggle per perspective: the fleet, the shown cluster or a prompt. */
function toggleAccessibleName(isFleet: boolean, shown: AccessibleCluster | undefined): string {
  if (isFleet) return `${FLEET_TITLE}, switch cluster`;
  return shown ? toggleLabel(shown) : 'Select a cluster';
}

/**
 * Case-insensitive substring match over name, display name and environment — both the enum value ("production") and
 * the label text ("prod") — so users can type what they see or what they mean (SW-7).
 */
function matchesSearch(cluster: AccessibleCluster, needle: string): boolean {
  const fields = [
    cluster.name,
    cluster.displayName,
    cluster.environment,
    environmentLabel(cluster.environment).text,
  ];
  return fields.some((field) => field.toLowerCase().includes(needle));
}

/**
 * "All clusters" body when there is nothing to pick: the menu can open before or without a cluster list (fleet
 * perspective; an admin whose list failed or is empty), so it says why instead of listing nothing. A failed list
 * gets the enabled {@link RETRY_ITEM_ID} row instead.
 */
function clusterListStatus(clusters: readonly AccessibleCluster[] | undefined, searchText: string): string {
  if (!clusters) return 'Loading clusters';
  if (clusters.length === 0) return 'No clusters';
  return `No clusters match "${searchText}"`;
}

/** One selectable cluster; `itemId` is the cluster name, the display name is the description when it differs. */
function ClusterItem({ cluster }: { cluster: AccessibleCluster }) {
  return (
    <MenuItem
      itemId={cluster.name}
      description={cluster.displayName !== cluster.name ? cluster.displayName : undefined}
    >
      <ClusterBadges cluster={cluster} />
    </MenuItem>
  );
}

/**
 * Sidebar context selector — FleetConsole's counterpart of OCP's perspective switcher (UX.md §2): a full-width toggle
 * at the top of the nav, its menu opening below at least as wide as the toggle. It switches the active cluster by
 * rewriting the URL (see {@link clusterSwitchPath}: path and filters are kept, SW-9); navigation only (SW-2). Built on PF `MenuContainer` + `Menu` (role `listbox`):
 *
 * - a search box, focused on open, filters by name, display name and environment; Enter opens the first match (SW-7);
 * - a "Recent" group from {@link useRecentClusters} above "All clusters" (contract order), hidden while searching,
 *   when empty (SW-8), when it would list every cluster again or only the shown cluster.
 *
 * Like OCP's `NavHeader` it is also the perspective switcher (ADR-0033 §6): admins (read-only admins too) get a
 * "Fleet management" entry first, above a divider and independent of the search, which leads to `/fleet` (FLEET-1/2).
 * In the fleet perspective (`/fleet/...`, for everyone) the toggle shows the globe icon and "Fleet management" and
 * that entry is selected; choosing a cluster goes to its root via {@link clusterSwitchPath} (FLEET-5).
 *
 * In the cluster perspective the toggle shows the active cluster; outside a cluster (e.g. Preferences) it shows
 * {@link usePreferredCluster} — the cluster the sidebar links target — and that cluster is marked selected.
 *
 * States (cluster perspective): loading → skeleton in a disabled toggle; error without cached data → "Clusters
 * unavailable — retry" toggle whose click refetches; empty → disabled "No clusters" toggle (SW-4). Admins skip the
 * error and empty toggles ("Select a cluster" instead), so Fleet management stays reachable; in the fleet perspective
 * the toggle never waits for the list. Then the menu says why it lists no clusters and offers a retry row.
 */
export function ClusterSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeCluster = useActiveCluster();
  const preferredCluster = usePreferredCluster();
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

  const all = clusters ?? [];
  const shownName = isFleet ? undefined : (activeCluster ?? preferredCluster);
  const shown = all.find((cluster) => cluster.name === shownName);
  const needle = searchText.trim().toLowerCase();
  const matches = needle ? all.filter((cluster) => matchesSearch(cluster, needle)) : all;
  // Hidden when it would only repeat "All clusters" (e.g. a single granted cluster) or hold nothing but the cluster
  // already checked in "All clusters" (T-0119 item 8).
  const showRecent =
    !needle && recent.length < all.length && recent.some((cluster) => cluster.name !== shown?.name);

  const showRetry = !clusters && error !== null;

  const changeOpen = (open: boolean) => {
    setIsOpen(open);
    if (!open) setSearchText('');
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

  const allList = (
    <MenuList aria-label="All clusters">
      {showRetry ? (
        <MenuItem itemId={RETRY_ITEM_ID}>
          Clusters unavailable — retry
        </MenuItem>
      ) : matches.length > 0 ? (
        matches.map((cluster) => <ClusterItem key={cluster.name} cluster={cluster} />)
      ) : (
        <MenuItem isDisabled>{clusterListStatus(clusters, searchText.trim())}</MenuItem>
      )}
    </MenuList>
  );

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
            onChange={(_event, value) => setSearchText(value)}
            onClear={() => setSearchText('')}
            // No `onSearch`: it would add a submit ("→") button that OCP's menu search doesn't have. Enter still opens
            // the first match (SW-7); the key event bubbles from the input to the SearchInput's wrapper.
            onKeyDown={(event) => {
              const first = matches[0];
              if (event.key === 'Enter' && needle && first) choose(first.name);
            }}
          />
        </MenuSearchInput>
        <NoMatchStatus text={needle && matches.length === 0 ? `No clusters match "${searchText.trim()}"` : undefined} />
      </MenuSearch>
      <Divider />
      <MenuContent maxMenuHeight="60vh">
        {/* Outside the search: the perspective entry stays while filtering clusters (FLEET-1). */}
        {isAdmin && (
          <>
            <MenuList aria-label="Fleet">
              <MenuItem itemId={FLEET_ITEM_ID} icon={<GlobeIcon />}>
                {FLEET_TITLE}
              </MenuItem>
            </MenuList>
            <Divider />
          </>
        )}
        {showRecent ? (
          <>
            <MenuGroup label="Recent" labelHeadingLevel="h3">
              <MenuList aria-label="Recent clusters">
                {recent.map((cluster) => (
                  <ClusterItem key={cluster.name} cluster={cluster} />
                ))}
              </MenuList>
            </MenuGroup>
            <Divider />
            <MenuGroup label="All clusters" labelHeadingLevel="h3">
              {allList}
            </MenuGroup>
          </>
        ) : (
          allList
        )}
      </MenuContent>
    </Menu>
  );

  return (
    <MenuContainer
      isOpen={isOpen}
      onOpenChange={changeOpen}
      menu={menu}
      menuRef={menuRef}
      toggleRef={toggleRef}
      // The popper is appended to <body>, so the sidebar's overflow never clips it.
      // At least as wide as the toggle; bounded so a very long name truncates instead of widening the menu.
      popperProps={{ minWidth: 'trigger', maxWidth: '28rem' }}
      toggle={
        <MenuToggle
          ref={toggleRef}
          isFullWidth
          icon={isFleet ? <GlobeIcon /> : <ClusterIcon />}
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
  );
}
