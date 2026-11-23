import { findModel, type K8sModel } from '@/shared/k8s';

/** Group segment of a {@link toRef} reference for the core (legacy) group, as in OCP's `referenceForModel`. */
const CORE_GROUP = 'core';

/**
 * The Search page's kind reference (`?kind=` value, SRCH-3, OCP `referenceForModel`): `group~version~Kind`, with
 * `core` for the core group (`core~v1~Pod`, `apps~v1~Deployment`). `~` never occurs in a group, version or kind, so
 * references survive a comma-separated URL parameter.
 */
export function toRef(model: Pick<K8sModel, 'group' | 'version' | 'kind'>): string {
  return `${model.group === '' ? CORE_GROUP : model.group}~${model.version}~${model.kind}`;
}

/** The known model of a {@link toRef} reference; `undefined` for a malformed reference or a kind we don't know. */
export function fromRef(ref: string): K8sModel | undefined {
  const parts = ref.split('~');
  if (parts.length !== 3) return undefined;
  const [group = '', version = '', kind = ''] = parts;
  if (!group || !version || !kind) return undefined;
  return findModel(group === CORE_GROUP ? version : `${group}/${version}`, kind);
}
