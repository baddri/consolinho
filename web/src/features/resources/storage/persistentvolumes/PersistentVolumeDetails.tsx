import {
  PersistentVolumeClaimModel,
  StorageClassModel,
  type K8sResource,
  type PersistentVolume,
} from '@/shared/k8s';
import { DetailsItem } from '@/shared/ui';
import { ResourceStatusLabel } from '../../components/ResourceStatusLabel';
import { ResourceLink } from '../../components/ResourceLink';
import { nodeAffinityLines, pvPhase, pvSource, pvSourceText } from './persistentVolume';

/** A listed PersistentVolume (`metadata` always present). */
export type PersistentVolumeResource = PersistentVolume & K8sResource;

/**
 * Link to the claim bound to the PV (`spec.claimRef`), or OCP's subtle "No claim" (`persistent-volume.tsx`). The
 * claim may no longer exist (a Released PV); the link is still shown, as in OCP.
 */
export function PvClaimLink({ pv }: { pv: PersistentVolume }) {
  const claim = pv.spec?.claimRef;
  return claim?.name ? (
    <ResourceLink model={PersistentVolumeClaimModel} name={claim.name} namespace={claim.namespace} />
  ) : (
    <div className="pf-v6-u-text-color-subtle">No claim</div>
  );
}

/** Metadata-column row after Annotations, as OCP `PVDetails`' `ResourceSummary` child: Reclaim policy. */
export function PersistentVolumeSummaryExtra({ obj }: { obj: PersistentVolumeResource }) {
  return (
    <DetailsItem label="Reclaim policy" path="spec.persistentVolumeReclaimPolicy">
      {obj.spec?.persistentVolumeReclaimPolicy}
    </DetailsItem>
  );
}

/**
 * Right column of the PV details in OCP `PVDetails` order (Status, Capacity, Access modes, Volume mode, StorageClass,
 * PersistentVolumeClaim), then what PV-1 adds: Node affinity (plain `key op values` lines) and the volume Source.
 */
export function PersistentVolumeDetails({ obj }: { obj: PersistentVolumeResource }) {
  const storage = obj.spec?.capacity?.storage;
  const accessModes = obj.spec?.accessModes ?? [];
  const storageClassName = obj.spec?.storageClassName;
  const affinity = nodeAffinityLines(obj);
  const source = pvSource(obj);
  return (
    <>
      <DetailsItem label="Status" path="status.phase">
        <ResourceStatusLabel status={{ title: pvPhase(obj) }} />
      </DetailsItem>
      {storage && (
        <DetailsItem label="Capacity" path="spec.capacity">
          {storage}
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
      <DetailsItem label="StorageClass" path="spec.storageClassName">
        {storageClassName ? <ResourceLink model={StorageClassModel} name={storageClassName} /> : 'None'}
      </DetailsItem>
      {obj.spec?.claimRef?.name && (
        <DetailsItem label="PersistentVolumeClaim" path="spec.claimRef">
          <PvClaimLink pv={obj} />
        </DetailsItem>
      )}
      {affinity.length > 0 && (
        <DetailsItem label="Node affinity" path="spec.nodeAffinity">
          {affinity.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </DetailsItem>
      )}
      {source && (
        <DetailsItem label="Source" data-testid="pv-source">
          {pvSourceText(source)}
        </DetailsItem>
      )}
    </>
  );
}
