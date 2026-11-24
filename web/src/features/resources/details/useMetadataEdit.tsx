import { useState, type ReactNode } from 'react';
import type { K8sModel, K8sResource } from '@/shared/k8s';
import { EditAnnotationsModal } from '../actions/EditAnnotationsModal';
import { EditLabelsModal } from '../actions/EditLabelsModal';
import { useResourceAccess } from '../actions/useResourceAccess';

/** Result of {@link useMetadataEdit}. */
export interface MetadataEdit {
  /** Whether the user may patch the object; `false` while the access review is pending (render plain text). */
  canEdit: boolean;
  openLabels: () => void;
  openAnnotations: () => void;
  /** The open Edit labels / Edit annotations modal, or `null`; render it next to the section. */
  dialog: ReactNode;
}

/**
 * In-place metadata editing of a details page (OCP `ResourceSummary` `canUpdate` + `labelsModalLauncher` /
 * `annotationsModalLauncher`): the same `patch` review on the named object as the Actions menu's "Edit labels" /
 * "Edit annotations" (so it shares that cached review), and the same modals.
 */
export function useMetadataEdit(cluster: string, model: K8sModel, obj: K8sResource): MetadataEdit {
  const [open, setOpen] = useState<'labels' | 'annotations' | null>(null);
  const { namespace, name } = obj.metadata;
  const access = useResourceAccess(cluster, { verb: 'patch', model, namespace, name });
  const canEdit = !access.isChecking && access.disabledReason === undefined;
  const close = () => setOpen(null);
  const dialog =
    open === 'labels' ? (
      <EditLabelsModal cluster={cluster} model={model} obj={obj} onClose={close} />
    ) : open === 'annotations' ? (
      <EditAnnotationsModal cluster={cluster} model={model} obj={obj} onClose={close} />
    ) : null;
  return {
    canEdit,
    openLabels: () => setOpen('labels'),
    openAnnotations: () => setOpen('annotations'),
    dialog,
  };
}
