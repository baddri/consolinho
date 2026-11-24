import { Flex, FlexItem } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { StorageClassModel, type K8sResource, type StorageClass } from '@/shared/k8s';
import { DASH, DetailsItem, DetailsSubsection } from '@/shared/ui';
import { ResourceLink } from '../../components/ResourceLink';
import { allowsExpansion, isDefaultClass } from './storageClass';
import styles from './storageClass.module.css';

/** A listed StorageClass (`metadata` always present). */
export type StorageClassResource = StorageClass & K8sResource;

/**
 * Name cell of the StorageClasses list: the usual kind badge + link, followed by OCP's subtle extra-small
 * "– Default" marker on the default class (`StorageClassTableRow`'s `ResourceLink` children).
 */
export function StorageClassName({ obj }: { obj: StorageClassResource }) {
  return (
    <Flex gap={{ default: 'gapNone' }} flexWrap={{ default: 'nowrap' }} alignItems={{ default: 'alignItemsBaseline' }}>
      <FlexItem>
        <ResourceLink model={StorageClassModel} name={obj.metadata.name ?? ''} />
      </FlexItem>
      {isDefaultClass(obj) && (
        <FlexItem className={`pf-v6-u-font-size-xs pf-v6-u-text-color-subtle ${styles.helpText}`}>
          &ndash; Default
        </FlexItem>
      )}
    </Flex>
  );
}

/** Metadata-column row after Annotations, as OCP `StorageClassDetails`' `ResourceSummary` child: Provisioner. */
export function StorageClassSummaryExtra({ obj }: { obj: StorageClassResource }) {
  return (
    <DetailsItem label="Provisioner" path="provisioner">
      {obj.provisioner}
    </DetailsItem>
  );
}

/**
 * Right column of the StorageClass details (OCP `StorageClassDetails`): Reclaim policy, Default class, Volume binding
 * mode, plus Allow volume expansion (spec SC-1; OCP doesn't show it), printed `true`/`false` as the field reads.
 */
export function StorageClassDetails({ obj }: { obj: StorageClassResource }) {
  return (
    <>
      <DetailsItem label="Reclaim policy" path="reclaimPolicy">
        {obj.reclaimPolicy ?? 'Delete'}
      </DetailsItem>
      <DetailsItem label="Default class">{isDefaultClass(obj) ? 'True' : 'False'}</DetailsItem>
      <DetailsItem label="Volume binding mode" path="volumeBindingMode">
        {obj.volumeBindingMode ?? 'Immediate'}
      </DetailsItem>
      <DetailsItem label="Allow volume expansion" path="allowVolumeExpansion">
        {String(allowsExpansion(obj))}
      </DetailsItem>
    </>
  );
}

/** "Parameters" section below the details grid: the provisioner's parameters as a compact key/value table. */
export function StorageClassParameters({ obj }: { obj: StorageClassResource }) {
  const parameters = Object.entries(obj.parameters ?? {});
  return (
    <DetailsSubsection title="Parameters">
      {parameters.length === 0 ? (
        <span className="pf-v6-u-text-color-subtle">No parameters</span>
      ) : (
        <Table aria-label="Parameters" variant="compact">
          <Thead>
            <Tr>
              <Th>Key</Th>
              <Th>Value</Th>
            </Tr>
          </Thead>
          <Tbody>
            {parameters.map(([key, value]) => (
              <Tr key={key}>
                <Td dataLabel="Key">{key}</Td>
                <Td dataLabel="Value">{value || DASH}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </DetailsSubsection>
  );
}
