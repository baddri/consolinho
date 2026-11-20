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
} from '@patternfly/react-core';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { AccessibleCluster } from '@/shared/api';
import { EnvironmentLabel, environmentLabel } from '@/shared/ui';
import { clusterSwitchPath } from './clusterSwitchPath';
import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';
import { useRecentClusters } from './useRecentClusters';

/** Name, environment label and — for an effective read-only mode (contract §6) — a "Read only" label. */
function ClusterBadges({ cluster }: { cluster: AccessibleCluster }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
      <FlexItem>{cluster.name}</FlexItem>
      <FlexItem>
        <EnvironmentLabel environment={cluster.environment} isCompact />
      </FlexItem>
      {cluster.accessMode === 'readOnly' && (
        <FlexItem>
          <Label isCompact>Read only</Label>
        </FlexItem>
      )}
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
 * Masthead context selector that switches the active cluster by rewriting the URL (see {@link clusterSwitchPath}:
 * path and filters are kept, SW-9); navigation only (SW-2). Built on PF `MenuContainer` + `Menu` (role `listbox`):
 *
 * - a search box, focused on open, filters by name, display name and environment; Enter opens the first match (SW-7);
 * - a "Recent" group from {@link useRecentClusters} above "All clusters" (contract order), hidden while searching or
 *   when empty (SW-8). The active cluster is marked selected.
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
      <MenuToggle status="danger" onClick={() => void refetch()}>
        Clusters unavailable — retry
      </MenuToggle>
    ) : (
      // The skeleton's screen-reader text is the toggle's accessible name.
      <MenuToggle isDisabled>
        <Skeleton width="8rem" screenreaderText="Loading clusters" />
      </MenuToggle>
    );
  }
  if (clusters.length === 0) {
    return <MenuToggle isDisabled>No clusters</MenuToggle>;
  }

  const active = clusters.find((cluster) => cluster.name === activeCluster);
  const needle = searchText.trim().toLowerCase();
  const matches = needle ? clusters.filter((cluster) => matchesSearch(cluster, needle)) : clusters;
  const showRecent = !needle && recent.length > 0;

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
      selected={active?.name}
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
            onSearch={() => {
              const first = matches[0];
              if (needle && first) choose(first.name);
            }}
          />
        </MenuSearchInput>
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
      toggle={
        <MenuToggle
          ref={toggleRef}
          onClick={() => changeOpen(!isOpen)}
          isExpanded={isOpen}
          aria-label={active ? toggleLabel(active) : 'Select a cluster'}
        >
          {active ? <ClusterBadges cluster={active} /> : 'Select a cluster'}
        </MenuToggle>
      }
    />
  );
}
