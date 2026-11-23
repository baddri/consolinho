import { Label } from '@patternfly/react-core';
import { CubesIcon, OpenshiftIcon } from '@patternfly/react-icons';
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
 * the cluster switcher only) and the generic `CubesIcon` for Kubernetes. Always `aria-hidden`: the accessible name
 * of the toggle and the `K8s` tag carry the type, so the icon is never the only cue.
 */
export function ClusterTypeIcon({ distribution }: ClusterTypeProps) {
  // TODO(CP5.5): Kubernetes logo icon (PatternFly ships none today).
  if (distribution === 'kubernetes') return <CubesIcon aria-hidden />;
  return <OpenshiftIcon aria-hidden />;
}
