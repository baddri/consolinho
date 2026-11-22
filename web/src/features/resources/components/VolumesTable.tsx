import { List, ListItem } from '@patternfly/react-core';
import { useCallback, useMemo, useState } from 'react';
import type { Pod } from '@/shared/k8s';
import {
  ConsoleDataView,
  DataViewTextFilter,
  type DataViewColumn,
  type DataViewFilterValue,
} from '@/shared/ui';
import { ObjectReferenceLink } from './ObjectReferenceLink';

type PodSpec = NonNullable<Pod['spec']>;
type Volume = NonNullable<PodSpec['volumes']>[number];

/** One row: a volume as mounted into one container (OCP `RowVolumeData`). */
interface VolumeRow {
  name: string;
  mountPath: string;
  subPath: string | undefined;
  readOnly: boolean;
  container: string;
  volume: Volume | undefined;
}

/** A volume mount per container, in spec order (OCP `getRowVolumeData`). */
function volumeRows(spec: PodSpec): VolumeRow[] {
  const volumes = new Map((spec.volumes ?? []).map((volume) => [volume.name, volume]));
  return spec.containers.flatMap((container) =>
    (container.volumeMounts ?? []).map((mount) => ({
      name: mount.name,
      mountPath: mount.mountPath,
      subPath: mount.subPath,
      readOnly: mount.readOnly === true,
      container: container.name,
      volume: volumes.get(mount.name),
    })),
  );
}

/** Type cell (OCP `VolumeType`): links to the config map / secret / claim behind it; projected sources listed. */
function VolumeType({ volume, namespace }: { volume: Volume | undefined; namespace: string | undefined }) {
  if (!volume) return null;
  const ref = (kind: string, name: string | undefined, apiVersion = 'v1') => (
    <ObjectReferenceLink apiVersion={apiVersion} kind={kind} name={name} namespace={namespace} />
  );
  if (volume.configMap) return ref('ConfigMap', volume.configMap.name);
  if (volume.secret) return ref('Secret', volume.secret.secretName);
  if (volume.persistentVolumeClaim)
    return ref('PersistentVolumeClaim', volume.persistentVolumeClaim.claimName);
  if (volume.projected) {
    return (
      <List isPlain>
        {(volume.projected.sources ?? []).map((source, index) => (
          // Projected sources have no identity of their own; their order is fixed by the spec.
          <ListItem key={index}>
            {source.configMap
              ? ref('ConfigMap', source.configMap.name)
              : source.secret
                ? ref('Secret', source.secret.name)
                : source.serviceAccountToken
                  ? 'ServiceAccountToken'
                  : source.downwardAPI
                    ? 'DownwardAPI'
                    : 'Projected'}
          </ListItem>
        ))}
      </List>
    );
  }
  return null;
}

/** Props for {@link VolumesTable}. */
export interface VolumesTableProps {
  /** The pod spec (a pod's `spec`, a workload's `spec.template.spec`). */
  spec: PodSpec | undefined;
  namespace: string | undefined;
}

/**
 * Volumes of a pod (template), as OCP `public/components/volumes-table.tsx`: a `ConsoleDataView` filterable by name
 * with Name, Mount path, SubPath, Type, Permissions and Utilized by — one row per mount. "No volumes" without any.
 */
export function VolumesTable({ spec, namespace }: VolumesTableProps) {
  const [name, setName] = useState('');
  const rows = useMemo(() => (spec ? volumeRows(spec) : []), [spec]);
  const filtered = useMemo(() => rows.filter((row) => row.name.includes(name.trim())), [rows, name]);
  const columns = useMemo<DataViewColumn<VolumeRow>[]>(
    () => [
      { id: 'name', title: 'Name', type: 'name', cell: (row) => row.name, sortValue: (row) => row.name },
      {
        id: 'mountPath',
        title: 'Mount path',
        cell: (row) => row.mountPath,
        sortValue: (row) => row.mountPath,
      },
      {
        id: 'subPath',
        title: 'SubPath',
        cell: (row) => row.subPath ?? <span className="pf-v6-u-text-color-subtle">No subpath</span>,
        sortValue: (row) => row.subPath ?? null,
      },
      { id: 'type', title: 'Type', cell: (row) => <VolumeType volume={row.volume} namespace={namespace} /> },
      {
        id: 'permissions',
        title: 'Permissions',
        cell: (row) => (row.readOnly ? 'Read-only' : 'Read/Write'),
        sortValue: (row) => (row.readOnly ? 'Read-only' : 'Read/Write'),
      },
      {
        id: 'utilizedBy',
        title: 'Utilized by',
        cell: (row) => row.container,
        sortValue: (row) => row.container,
      },
    ],
    [namespace],
  );
  const filterNodes = useMemo(
    () => [<DataViewTextFilter key="name" filterId="name" title="Name" placeholder="Filter by name" />],
    [],
  );
  const onFilterChange = useCallback((_filterId: string, value: DataViewFilterValue) => {
    setName(typeof value === 'string' ? value : '');
  }, []);

  if (rows.length === 0) return <>No volumes</>;
  return (
    <ConsoleDataView
      id="volumes"
      label="Volumes"
      data={rows}
      filteredData={filtered}
      loaded
      columns={columns}
      getRowId={(row) => `${row.container}/${row.name}/${row.mountPath}`}
      filterNodes={filterNodes}
      filterValues={{ name }}
      onFilterChange={onFilterChange}
      onClearAllFilters={() => setName('')}
      isFiltered={name !== ''}
    />
  );
}
