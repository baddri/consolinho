import { Flex, FlexItem, Label } from '@patternfly/react-core';
import type { Control } from 'react-hook-form';
import type { ClusterListItem } from '@/shared/api';
import { EnvironmentLabel } from '@/shared/ui';
import { useClusters } from '../clusters/api';
import type { GrantFormValues } from './grantForm.schema';
import { TypeaheadSelectField, type TypeaheadOption } from './TypeaheadSelectField';

/** Props for {@link ClusterTypeahead}. */
export interface ClusterTypeaheadProps {
  control: Control<GrantFormValues>;
  /** Clusters the user already has a grant on: listed, but disabled with "already has access". */
  granted: ReadonlySet<string>;
  onValueChange: (clusterName: string) => void;
}

/** Second line of a cluster option: environment, display name, disabled state and existing access. */
function ClusterFacts({ cluster, hasAccess }: { cluster: ClusterListItem; hasAccess: boolean }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <EnvironmentLabel environment={cluster.environment} isCompact />
      </FlexItem>
      {cluster.displayName !== cluster.name && <FlexItem>{cluster.displayName}</FlexItem>}
      {!cluster.isEnabled && (
        <FlexItem>
          <Label isCompact color="grey">
            Disabled
          </Label>
        </FlexItem>
      )}
      {hasAccess && <FlexItem>already has access</FlexItem>}
    </Flex>
  );
}

/**
 * Cluster picker of "Add access" on the user page (GRANT-2): every admin cluster with its environment label, the
 * ones the user can already reach disabled with "already has access". Disabled clusters may be granted (the grant
 * applies once the cluster is enabled again).
 */
export function ClusterTypeahead({ control, granted, onValueChange }: ClusterTypeaheadProps) {
  const { data, error, isPending } = useClusters();
  const options: TypeaheadOption[] = (data ?? []).map((cluster) => ({
    value: cluster.name,
    searchText: cluster.displayName,
    isDisabled: granted.has(cluster.name),
    description: <ClusterFacts cluster={cluster} hasAccess={granted.has(cluster.name)} />,
  }));
  return (
    <TypeaheadSelectField
      control={control}
      label="Cluster"
      placeholder="Search clusters"
      options={options}
      isLoading={isPending}
      loadError={error ? 'Could not load clusters' : undefined}
      onValueChange={onValueChange}
    />
  );
}
