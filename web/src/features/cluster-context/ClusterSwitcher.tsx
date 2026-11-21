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
import { ClusterIcon } from '@patternfly/react-icons';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { AccessibleCluster } from '@/shared/api';
import { EnvironmentLabel, environmentLabel } from '@/shared/ui';
import { clusterSwitchPath } from './clusterSwitchPath';
import { NoMatchStatus } from './NoMatchStatus';
import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';
import { usePreferredCluster } from './usePreferredCluster';
import { useRecentClusters } from './useRecentClusters';

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
 * Toggle content: the name as a heading like OCP's perspective switcher (`Title h2 size="md"`) with the labels on a
 * second line, so the narrow sidebar gives the name its full width; longer names still truncate with a tooltip.
 */
function ToggleContent({ cluster }: { cluster: AccessibleCluster }) {
  return (
    <Flex
      direction={{ default: 'column' }}
      spaceItems={{ default: 'spaceItemsXs' }}
      className="pf-v6-u-min-width pf-v6-u-text-align-start"
    >
      <Title headingLevel="h2" size="md">
        <Truncate content={cluster.name} />
      </Title>
      <Flex spaceItems={{ default: 'spaceItemsSm' }}>
        <ClusterLabels cluster={cluster} />
      </Flex>
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
 *   when empty (SW-8) or when it would list every cluster again.
 *
 * The toggle shows the active cluster; outside a cluster (admin pages) it shows {@link usePreferredCluster} — the
 * cluster the sidebar links target — and that cluster is marked selected.
 *
 * States: loading → skeleton in a disabled toggle; error without cached data → "Clusters unavailable — retry" toggle
 * whose click refetches; empty → disabled "No clusters" toggle (SW-4).
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

  // Focus the search box once the popper has rendered the menu (same deferral PF uses for its own open focus).
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!clusters) {
    return error ? (
      <MenuToggle isFullWidth status="danger" onClick={() => void refetch()}>
        Clusters unavailable — retry
      </MenuToggle>
    ) : (
      // The skeleton's screen-reader text is the toggle's accessible name.
      <MenuToggle isFullWidth isDisabled>
        <Skeleton width="8rem" screenreaderText="Loading clusters" />
      </MenuToggle>
    );
  }
  if (clusters.length === 0) {
    return (
      <MenuToggle isFullWidth isDisabled icon={<ClusterIcon />}>
        No clusters
      </MenuToggle>
    );
  }

  const shownName = activeCluster ?? preferredCluster;
  const shown = clusters.find((cluster) => cluster.name === shownName);
  const needle = searchText.trim().toLowerCase();
  const matches = needle ? clusters.filter((cluster) => matchesSearch(cluster, needle)) : clusters;
  // Hidden when it would only repeat "All clusters" (e.g. a single granted cluster).
  const showRecent = !needle && recent.length > 0 && recent.length < clusters.length;

  const changeOpen = (open: boolean) => {
    setIsOpen(open);
    if (!open) setSearchText('');
  };

  const choose = (name: string) => {
    changeOpen(false);
    toggleRef.current?.focus();
    if (name !== activeCluster) void navigate(clusterSwitchPath(location, name));
  };

  const allList = (
    <MenuList aria-label="All clusters">
      {matches.length > 0 ? (
        matches.map((cluster) => <ClusterItem key={cluster.name} cluster={cluster} />)
      ) : (
        <MenuItem isDisabled>{`No clusters match "${searchText.trim()}"`}</MenuItem>
      )}
    </MenuList>
  );

  const menu = (
    <Menu
      ref={menuRef}
      role="listbox"
      selected={shown?.name}
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
        <NoMatchStatus text={matches.length === 0 ? `No clusters match "${searchText.trim()}"` : undefined} />
      </MenuSearch>
      <Divider />
      <MenuContent maxMenuHeight="60vh">
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
          icon={<ClusterIcon />}
          onClick={() => changeOpen(!isOpen)}
          isExpanded={isOpen}
          aria-label={shown ? toggleLabel(shown) : 'Select a cluster'}
        >
          {shown ? <ToggleContent cluster={shown} /> : 'Select a cluster'}
        </MenuToggle>
      }
    />
  );
}
