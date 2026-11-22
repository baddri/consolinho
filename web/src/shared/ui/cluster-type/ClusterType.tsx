import { Label } from '@patternfly/react-core';
import { ClusterIcon, CubesIcon } from '@patternfly/react-icons';
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
 * The cluster type icon (UX.md §2a): generic PF shapes that differ at a glance — `ClusterIcon` for OpenShift,
 * `CubesIcon` for Kubernetes (never logo look-alikes). Always `aria-hidden`: the tag or text next to it carries the
 * meaning, so the icon is never the only cue.
 */
export function ClusterTypeIcon({ distribution }: ClusterTypeProps) {
  return distribution === 'kubernetes' ? <CubesIcon aria-hidden /> : <ClusterIcon aria-hidden />;
}
