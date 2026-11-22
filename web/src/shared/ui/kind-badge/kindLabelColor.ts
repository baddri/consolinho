import type { LabelProps } from '@patternfly/react-core';

/**
 * Kind → PF `Label` colour of its Kubernetes labels, as OCP `$kindsToModifier` (`public/style/_text.scss`, applied to
 * `.co-label.co-m-<kind>`). Kinds not listed keep PF's default grey.
 */
const KIND_LABEL_COLORS: Readonly<Record<string, LabelProps['color']>> = {
  ConfigMap: 'purple',
  DaemonSet: 'blue',
  Deployment: 'blue',
  DeploymentConfig: 'blue',
  Ingress: 'purple',
  Job: 'blue',
  Namespace: 'green',
  Node: 'purple',
  Pod: 'teal',
  Project: 'green',
  ReplicaSet: 'blue',
  ReplicationController: 'blue',
  Secret: 'orange',
  Service: 'green',
  ServiceAccount: 'purple',
};

/** The `Label` colour OCP gives the labels of an object of `kind`; `undefined` = default grey. */
export function kindLabelColor(kind: string): LabelProps['color'] {
  return KIND_LABEL_COLORS[kind];
}
