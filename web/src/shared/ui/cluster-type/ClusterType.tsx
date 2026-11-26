import { Label } from '@patternfly/react-core';
import { OpenshiftIcon } from '@patternfly/react-icons';
import { createIcon } from '@patternfly/react-icons/dist/esm/createIcon';
import { siKubernetes } from 'simple-icons';
import type { ClusterDistribution } from '@/shared/api';

/** Short tag (switcher toggle, rows, lists) and full word (forms, details) of a cluster distribution. */
export interface ClusterTypeText {
  tag: string;
  word: string;
}

const CLUSTER_TYPE_TEXT: Record<ClusterDistribution, ClusterTypeText> = {
  openShift: { tag: 'OCP', word: 'OpenShift' },
  kubernetes: { tag: 'K8s', word: 'Kubernetes' },
};

/**
 * Tag and word of a declared distribution (SW-3, SW-6, DIST-3): `openShift` ⇒ `OCP` / `OpenShift`, `kubernetes` ⇒
 * `K8s` / `Kubernetes`. Exposed for places that cannot render {@link ClusterTypeLabel} (option text, filter chips,
 * accessible names). The declared distribution is presentation only; features follow discovery (ADR-0032).
 */
export function clusterTypeText(distribution: ClusterDistribution): ClusterTypeText {
  return CLUSTER_TYPE_TEXT[distribution];
}

/**
 * The Kubernetes logo as a PatternFly icon (T-0393). PF ships none, so the path comes from `simple-icons` (CC0) and
 * `createIcon` gives it PF's icon sizing and `currentColor` fill, like `OpenshiftIcon`.
 */
const KubernetesIcon = createIcon({ name: 'KubernetesIcon', width: 24, height: 24, svgPath: siKubernetes.path });

/** Props of {@link ClusterTypeLabel} and {@link ClusterTypeIcon}. */
export interface ClusterTypeProps {
  distribution: ClusterDistribution;
}

/**
 * The cluster type tag (UX.md §2a): a compact, filled, default-grey PF `Label` reading `OCP` or `K8s`. Its own
 * surface keeps it readable on the Kubernetes navy masthead and inside menus.
 */
export function ClusterTypeLabel({ distribution }: ClusterTypeProps) {
  return <Label isCompact>{clusterTypeText(distribution).tag}</Label>;
}

/**
 * The cluster type icon (UX.md §2a): PatternFly's own `OpenshiftIcon` for OpenShift (the one logo exception, used in
 * the cluster switcher only) and the Kubernetes logo (`simple-icons`, T-0393) for Kubernetes. Always `aria-hidden`:
 * the accessible names of the toggle and menu items carry the type, so the icon is never the only cue.
 */
export function ClusterTypeIcon({ distribution }: ClusterTypeProps) {
  if (distribution === 'kubernetes') return <KubernetesIcon aria-hidden />;
  return <OpenshiftIcon aria-hidden />;
}
