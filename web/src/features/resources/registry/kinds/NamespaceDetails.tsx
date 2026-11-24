import { PROJECT_ANNOTATIONS, type K8sResource } from '@/shared/k8s';
import { DetailsItem } from '@/shared/ui';

/** A Namespace or Project: both carry `status.phase` and the OpenShift project annotations. */
export type NamespaceLike = K8sResource & { status?: { phase?: string } };

/** Props for {@link NamespaceDetails}. */
export interface NamespaceDetailsProps {
  obj: NamespaceLike;
}

/**
 * Right-column details fields shared by Projects and Namespaces (UI-4): status, display name, description and
 * requester — the requester row only when the annotation is set (namespaces usually lack it).
 */
export function NamespaceDetails({ obj }: NamespaceDetailsProps) {
  const annotations = obj.metadata.annotations ?? {};
  const requester = annotations[PROJECT_ANNOTATIONS.requester];
  return (
    <>
      <DetailsItem label="Status" path="status.phase">{obj.status?.phase ?? 'Unknown'}</DetailsItem>
      <DetailsItem label="Display name">{annotations[PROJECT_ANNOTATIONS.displayName] ?? '—'}</DetailsItem>
      <DetailsItem label="Description">{annotations[PROJECT_ANNOTATIONS.description] ?? '—'}</DetailsItem>
      {requester !== undefined && <DetailsItem label="Requester">{requester}</DetailsItem>}
    </>
  );
}
