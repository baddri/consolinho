import { useState, type ReactNode } from 'react';
import type { K8sModel } from '@/shared/k8s';
import { useActionAccess } from '../../actions/useActionAccess';
import type { KindActionArgs, ResourceActionItem } from '../../registry/types';
import { ConfigureCountModal, type CountField, type CountedWorkload } from './ConfigureCountModal';
import { useRelatedHPA } from './useRelatedHPA';

/** Options of {@link useEditCountAction}. */
export interface EditCountActionOptions {
  /** `parallelism` for Jobs; defaults to `replicas`. */
  field?: CountField;
}

/** The count menu item (absent under an HPA) and its open dialog (`null` when closed). */
export interface EditCountAction {
  item: ResourceActionItem | undefined;
  dialog: ReactNode;
}

/**
 * "Edit Pod count" (`replicas`, gated on `patch <plural>/scale`) or "Edit parallelism" (`parallelism`, gated on
 * `patch <plural>`) for any workload `model`, opening {@link ConfigureCountModal}. As OCP's Deployment and
 * DeploymentConfig providers, no item is returned while an HPA scales the workload (HPA-1): the autoscaler owns the
 * count. Until the HPA list has loaded the item shows, so the menu does not reorder for the common case. List-row
 * kebabs (`reviewByName` false) skip the HPA lookup and always show the access-gated item, so rows open no HPA watch.
 */
export function useEditCountAction(
  { cluster, obj, reviewByName }: KindActionArgs<CountedWorkload>,
  model: K8sModel,
  { field = 'replicas' }: EditCountActionOptions = {},
): EditCountAction {
  const [open, setOpen] = useState(false);
  // Only the details page looks up the HPA: list rows (reviewByName false) would open one watch per row kebab.
  const hpa = useRelatedHPA(cluster, obj, { enabled: reviewByName && field === 'replicas' });
  const access = useActionAccess(
    cluster,
    {
      verb: 'patch',
      model,
      ...(field === 'replicas' ? { subresource: 'scale' } : {}),
      namespace: obj.metadata.namespace,
      name: obj.metadata.name ?? '',
    },
    reviewByName,
  );
  // Jobs have no scale subresource and OCP does not hide Edit parallelism for HPAs (they cannot target Jobs).
  const hidden = field === 'replicas' && hpa !== undefined;

  return {
    item: hidden
      ? undefined
      : {
          itemKey: field === 'parallelism' ? 'edit-parallelism' : 'edit-pod-count',
          title: field === 'parallelism' ? 'Edit parallelism' : 'Edit Pod count',
          onClick: () => {
            if (!access.isAriaDisabled) setOpen(true);
          },
          ...access,
        },
    dialog: open ? (
      <ConfigureCountModal
        cluster={cluster}
        model={model}
        obj={obj}
        field={field}
        onClose={() => setOpen(false)}
      />
    ) : null,
  };
}
