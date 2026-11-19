import {
  Flex,
  FlexItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { useState, type Ref } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { EnvironmentLabel } from '@/shared/ui';
import { clusterSwitchPath } from './clusterSwitchPath';
import { PLACEHOLDER_CLUSTERS } from './clusters';
import { useActiveCluster } from './useActiveCluster';

/**
 * Masthead dropdown that switches the active cluster by rewriting the URL (see {@link clusterSwitchPath}).
 *
 * Placeholder: lists hard-coded clusters until the Api provides the user's granted clusters.
 */
export function ClusterSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const activeCluster = useActiveCluster();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = PLACEHOLDER_CLUSTERS.find((cluster) => cluster.name === activeCluster);

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
      selected={activeCluster}
      onSelect={(_event, value: unknown) => onSelect(value)}
      onOpenChange={setIsOpen}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen((open) => !open)}
          isExpanded={isOpen}
          aria-label={active ? `Cluster ${active.name}, switch cluster` : 'Select a cluster'}
        >
          {active ? (
            <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
              <FlexItem>{active.name}</FlexItem>
              <FlexItem>
                <EnvironmentLabel environment={active.environment} isCompact />
              </FlexItem>
            </Flex>
          ) : (
            'Select a cluster'
          )}
        </MenuToggle>
      )}
      shouldFocusToggleOnSelect
    >
      <SelectList aria-label="Clusters">
        {PLACEHOLDER_CLUSTERS.map((cluster) => (
          <SelectOption key={cluster.name} value={cluster.name}>
            <Flex spaceItems={{ default: 'spaceItemsSm' }}>
              <FlexItem>{cluster.name}</FlexItem>
              <FlexItem>
                <EnvironmentLabel environment={cluster.environment} isCompact />
              </FlexItem>
            </Flex>
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );
}
