import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { K8sResource } from '@/shared/k8s';
import { resourcePath } from '../paths';
import type { KindActions, ResourceActionItem, ResourceDescriptor } from '../registry/types';
import { DeleteResourceModal } from './DeleteResourceModal';
import { useActionAccess } from './useActionAccess';

export type { ResourceActionItem } from '../registry/types';

/** Options of {@link useResourceActions}. */
export interface ResourceActionsOptions {
  cluster: string;
  descriptor: ResourceDescriptor;
  obj: K8sResource;
  /**
   * Whether access checks name the object. List rows pass `false` so every row of a namespace shares one
   * SelfSubjectAccessReview (ADR-0022 §9); the details page passes `true`.
   */
  reviewByName: boolean;
  /** Runs after a successful delete (the details page returns to the list). */
  onDeleted?: () => void;
}

/** Result of {@link useResourceActions}. */
export interface ResourceActions {
  /** Menu items in display order. */
  items: ResourceActionItem[];
  /** The open dialog (kind or common; one at a time), or `null`; render it next to the menu. */
  dialog: ReactNode;
}

const NO_KIND_ACTIONS: KindActions = { items: [], dialog: null };

/** The kind hook of descriptors without kind actions, so `useResourceActions` always calls exactly one hook. */
function noKindActions(): KindActions {
  return NO_KIND_ACTIONS;
}

/**
 * Builds the actions of one object (ADR-0037 §3, UI-8/9) and owns the dialogs they open, so the row kebab and the
 * details Actions menu offer the same items: the kind's own items (`descriptor.useKindActions`) first, then OCP's
 * common actions in `useCommonActions` order, worded as OCP and in normal colour — "Edit <Kind>" (opens the YAML tab;
 * always enabled, the tab explains read-only itself) and "Delete <Kind>", gated by {@link useActionAccess}.
 *
 * Callers key the menu by `modelKey(descriptor.model)`, so the kind hook runs on every render of one instance and a
 * kind change remounts the menu instead of swapping hooks (rules of hooks).
 */
export function useResourceActions({
  cluster,
  descriptor,
  obj,
  reviewByName,
  onDeleted,
}: ResourceActionsOptions): ResourceActions {
  const { model } = descriptor;
  const namespace = obj.metadata.namespace;
  const name = obj.metadata.name ?? '';
  const navigate = useNavigate();
  // Exactly one of the two runs for the whole life of the menu: callers key it by the model, so the descriptor (and
  // with it the branch) never changes between renders of one instance.
  const kind = descriptor.useKindActions
    ? descriptor.useKindActions({ cluster, obj, reviewByName })
    : noKindActions();
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const deleteAccess = useActionAccess(cluster, { verb: 'delete', model, namespace, name }, reviewByName);

  const common: ResourceActionItem[] = [
    {
      itemKey: 'edit',
      title: `Edit ${model.kind}`,
      onClick: () => void navigate(resourcePath(cluster, model, { namespace, name, tab: 'yaml' })),
    },
    {
      itemKey: 'delete',
      title: `Delete ${model.kind}`,
      onClick: () => {
        if (!deleteAccess.isAriaDisabled) setDeleteOpen(true);
      },
      ...deleteAccess,
    },
  ];

  const commonDialog = isDeleteOpen ? (
    <DeleteResourceModal
      cluster={cluster}
      descriptor={descriptor}
      namespace={namespace}
      name={name}
      onDeleted={onDeleted}
      onClose={() => setDeleteOpen(false)}
    />
  ) : null;
  return { items: [...kind.items, ...common], dialog: kind.dialog ?? commonDialog };
}
