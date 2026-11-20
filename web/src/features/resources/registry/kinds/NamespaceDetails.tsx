import { DescriptionList } from '@patternfly/react-core';
import { PROJECT_ANNOTATIONS, type K8sResource } from '@/shared/k8s';
import { DetailItem } from './DetailItem';

/** A Namespace or Project: both carry `status.phase` and the OpenShift project annotations. */
export type NamespaceLike = K8sResource & { status?: { phase?: string } };

/** Props for {@link NamespaceDetails}. */
export interface NamespaceDetailsProps {
  obj: NamespaceLike;
}

/**
 * Details part shared by Projects and Namespaces (UI-4): status, display name, description and requester — the
 * requester row only when the annotation is set (namespaces usually lack it).
 */
export function NamespaceDetails({ obj }: NamespaceDetailsProps) {
  const annotations = obj.metadata.annotations ?? {};
  const requester = annotations[PROJECT_ANNOTATIONS.requester];
  return (
    <DescriptionList aria-label={`${obj.kind} details`} isCompact isHorizontal>
      <DetailItem term="Status">{obj.status?.phase ?? 'Unknown'}</DetailItem>
      <DetailItem term="Display name">{annotations[PROJECT_ANNOTATIONS.displayName] ?? '—'}</DetailItem>
      <DetailItem term="Description">{annotations[PROJECT_ANNOTATIONS.description] ?? '—'}</DetailItem>
      {requester !== undefined && <DetailItem term="Requester">{requester}</DetailItem>}
    </DescriptionList>
  );
}
