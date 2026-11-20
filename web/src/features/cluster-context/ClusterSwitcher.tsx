import {
  Flex,
  FlexItem,
  Label,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Skeleton,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { useState, type Ref } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { AccessibleCluster } from '@/shared/api';
import { EnvironmentLabel, environmentLabel } from '@/shared/ui';
import { clusterSwitchPath } from './clusterSwitchPath';
import { useAccessibleClusters } from './useAccessibleClusters';
import { useActiveCluster } from './useActiveCluster';

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
 * Masthead dropdown that switches the active cluster by rewriting the URL (see {@link clusterSwitchPath}); navigation
 * only (SW-2). Lists the user's clusters from {@link useAccessibleClusters} in contract order.
 *
 * States: loading → skeleton in a disabled toggle; error without cached data → "Clusters unavailable — retry" toggle
 * whose click refetches; empty → disabled "No clusters" toggle (SW-4).
 *
 * Typeahead-ready (CP2): the options are a plain derived list rendered by one `SelectOption` per cluster, so a filter
 * input in the toggle can narrow `options` without restructuring.
 */
export function ClusterSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const activeCluster = useActiveCluster();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: clusters, error, refetch } = useAccessibleClusters();

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

  const options = clusters;
  const active = clusters.find((cluster) => cluster.name === activeCluster);

  // PatternFly types option values as `any`; accept `unknown` and narrow.
  const onSelect = (value: unknown) => {
    setIsOpen(false);
    if (typeof value === 'string' && value !== activeCluster) {
      void navigate(clusterSwitchPath(pathname, value));
    }
  };

  return (
    <Select
      isOpen={isOpen}
      selected={active?.name}
      onSelect={(_event, value: unknown) => onSelect(value)}
      onOpenChange={setIsOpen}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen((open) => !open)}
          isExpanded={isOpen}
          aria-label={active ? toggleLabel(active) : 'Select a cluster'}
        >
          {active ? <ClusterBadges cluster={active} /> : 'Select a cluster'}
        </MenuToggle>
      )}
      shouldFocusToggleOnSelect
    >
      <SelectList aria-label="Clusters">
        {options.map((cluster) => (
          <SelectOption
            key={cluster.name}
            value={cluster.name}
            description={cluster.displayName !== cluster.name ? cluster.displayName : undefined}
          >
            <ClusterBadges cluster={cluster} />
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );
}
