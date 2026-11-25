import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { ContainerImage } from 'kubernetes-types/core/v1';
import { formatBinaryBytes } from '@/shared/k8s';
import { DASH } from '@/shared/ui';
import styles from './NodeImagesTable.module.css';

/** An image as OCP `NodeDetailsImages` lists it: the first tag-like name, else the first (digest) name. */
export function nodeImageName(names: readonly string[]): string {
  return names.find((name) => !name.includes('@') && !name.includes('<none>')) ?? names[0] ?? '';
}

/**
 * Images cached on the node, as OCP `NodeDetailsImages`: a compact Name | Size table of the `status.images` entries
 * that have names (no empty state: OCP renders just the header). Name is selected in one click to copy.
 */
export function NodeImagesTable({ images }: { images: readonly ContainerImage[] | undefined }) {
  const named = (images ?? []).filter((image) => image.names?.length);
  return (
    <Table aria-label="Images" variant="compact" gridBreakPoint="">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Size</Th>
        </Tr>
      </Thead>
      <Tbody>
        {named.map((image, index) => (
          // Names may repeat across entries (one image under several digests): the index keeps keys unique, as OCP.
          <Tr key={index}>
            <Td dataLabel="Name" modifier="breakWord" className={styles.selectToCopy}>
              {nodeImageName(image.names ?? [])}
            </Td>
            <Td dataLabel="Size">
              {image.sizeBytes === undefined ? DASH : formatBinaryBytes(image.sizeBytes)}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
