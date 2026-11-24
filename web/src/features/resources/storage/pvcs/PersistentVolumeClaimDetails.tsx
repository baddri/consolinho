import { RhUiSearchIcon } from '@patternfly/react-icons';
import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import {
  labelSelectorString,
  PersistentVolumeModel,
  PodModel,
  StorageClassModel,
  useK8sList,
  type K8sResource,
  type PersistentVolumeClaim,
  type Pod,
} from '@/shared/k8s';
import { DASH, DetailsItem, DetailsSubsection } from '@/shared/ui';
import { ConditionsTable } from '../../components/ConditionsTable';
import { ResourceLink } from '../../components/ResourceLink';
import { ResourceStatusLabel } from '../../components/ResourceStatusLabel';
import { resourcePath } from '../../paths';
import { formatBytes, podsMountingClaim, pvcCapacityBytes, pvcPhase, pvcRequestBytes } from './persistentVolumeClaim';

/** A listed PersistentVolumeClaim (`metadata` always present). */
export type PersistentVolumeClaimResource = PersistentVolumeClaim & K8sResource;

/** A listed pod (`metadata` always present). */
type PodResource = Pod & K8sResource;

/** Link to the claim's bound PV (`spec.volumeName`), or OCP's subtle "No PersistentVolume". */
export function PvcVolumeLink({ pvc }: { pvc: PersistentVolumeClaim }) {
  const volumeName = pvc.spec?.volumeName;
  return volumeName ? (
    <ResourceLink model={PersistentVolumeModel} name={volumeName} />
  ) : (
    <div className="pf-v6-u-text-color-subtle">No PersistentVolume</div>
  );
}

/**
 * OCP `PVCDetails`' `ResourceSummary` child, "Label selector": the claim's `spec.selector` for PVs as a link to the
 * PersistentVolumes list filtered by it (OCP `Selector kind="PersistentVolume"`), or "No selector".
 */
export function PersistentVolumeClaimSummaryExtra({ obj }: { obj: PersistentVolumeClaimResource }) {
  const cluster = useActiveCluster();
  const text = labelSelectorString(obj.spec?.selector);
  let value;
  if (text === '') value = <div className="pf-v6-u-text-color-subtle">No selector</div>;
  else if (cluster === undefined) value = text;
  else {
    const search = new URLSearchParams({ label: text }).toString();
    value = (
      <Link to={resourcePath(cluster, PersistentVolumeModel, { search })}>
        <RhUiSearchIcon className="pf-v6-u-mr-xs" />
        {text.replace(/,/g, ', ')}
      </Link>
    );
  }
  return (
    <DetailsItem label="Label selector" path="spec.selector">
      {value}
    </DetailsItem>
  );
}

/**
 * Right column of the PVC details in OCP `PVCDetails` order and labels (Status, Requested capacity, Capacity when
 * bound, Access modes, Volume mode, StorageClasses, PersistentVolumes), then PVC-2's "Pods" item. OCP's Used row and
 * capacity donut need Prometheus (parity gap); VolumeAttributesClass rows are out of scope.
 */
export function PersistentVolumeClaimDetails({ obj }: { obj: PersistentVolumeClaimResource }) {
  const capacity = formatBytes(pvcCapacityBytes(obj));
  const accessModes = obj.status?.accessModes ?? [];
  const storageClassName = obj.spec?.storageClassName;
  return (
    <>
      <DetailsItem label="Status" path="status.phase">
        <ResourceStatusLabel status={{ title: pvcPhase(obj) }} />
      </DetailsItem>
      <DetailsItem label="Requested capacity" path="spec.resources.requests">
        {formatBytes(pvcRequestBytes(obj) ?? 0)}
      </DetailsItem>
      {capacity !== undefined && (
        <DetailsItem label="Capacity" path="status.capacity">
          {capacity}
        </DetailsItem>
      )}
      {accessModes.length > 0 && (
        <DetailsItem label="Access modes" path="spec.accessModes">
          {accessModes.join(', ')}
        </DetailsItem>
      )}
      <DetailsItem label="Volume mode" path="spec.volumeMode">
        {obj.spec?.volumeMode ?? 'Filesystem'}
      </DetailsItem>
      <DetailsItem label="StorageClasses" path="spec.storageClassName">
        {storageClassName ? <ResourceLink model={StorageClassModel} name={storageClassName} /> : DASH}
      </DetailsItem>
      {obj.spec?.volumeName && (
        <DetailsItem label="PersistentVolumes" path="spec.volumeName">
          <PvcVolumeLink pvc={obj} />
        </DetailsItem>
      )}
      <PvcPodsItem obj={obj} />
    </>
  );
}

/**
 * "Pods" item (PVC-2): a link per pod of the claim's namespace that mounts it, from the namespace's shared Pods watch
 * filtered by {@link podsMountingClaim}. None, a failed list or no active cluster show a dash; the item is secondary.
 */
function PvcPodsItem({ obj }: { obj: PersistentVolumeClaimResource }) {
  const cluster = useActiveCluster();
  const { namespace, name = '' } = obj.metadata;
  const list = useK8sList<PodResource>(cluster ?? '', PodModel, { namespace, enabled: cluster !== undefined });
  const pods = list.error || !list.data ? [] : podsMountingClaim(list.data, name);
  return (
    <DetailsItem label="Pods">
      {pods.length === 0
        ? DASH
        : pods.map((pod) => (
            <div key={pod.metadata.uid ?? pod.metadata.name}>
              <ResourceLink model={PodModel} name={pod.metadata.name ?? ''} namespace={namespace} />
            </div>
          ))}
    </DetailsItem>
  );
}

/** OCP's "Conditions" section under the PVC details (e.g. `FileSystemResizePending` while an expansion waits). */
export function PersistentVolumeClaimSections({ obj }: { obj: PersistentVolumeClaimResource }) {
  return (
    <DetailsSubsection title="Conditions">
      <ConditionsTable conditions={obj.status?.conditions} />
    </DetailsSubsection>
  );
}
