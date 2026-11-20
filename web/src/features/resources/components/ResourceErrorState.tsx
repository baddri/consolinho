import { EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { LockIcon } from '@patternfly/react-icons';
import { ApiError } from '@/shared/api';
import type { K8sModel } from '@/shared/k8s';
import { ErrorState } from '@/shared/ui';
import { ALL_NAMESPACES } from '../paths';

/** Props for {@link ResourceErrorState}. */
export interface ResourceErrorStateProps {
  error: unknown;
  cluster: string;
  model: K8sModel;
  /** Namespace of the request; {@link ALL_NAMESPACES} for all namespaces; omitted for cluster-scoped kinds. */
  namespace?: string;
  /** Verb named in the "Restricted access" text (default `list`). */
  verb?: 'list' | 'get';
  /** Retry of the failed query (not offered for 403: retrying won't change RBAC). */
  onRetry: () => void;
}

/** True for the API server's RBAC denial (`Kubernetes.Forbidden`, ADR-0022 §2). */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'Kubernetes.Forbidden';
}

function scopeText(model: K8sModel, namespace: string | undefined): string {
  if (!model.namespaced || namespace === undefined) return '';
  return namespace === ALL_NAMESPACES ? ' in any project' : ` in ${namespace}`;
}

/**
 * Error state of a resource page (UI-10): the API server's 403 becomes "Restricted access" naming the cluster's
 * service account, verb, resource and namespace; anything else (incl. `Proxy.*` 502/504) is an `ErrorState` with the
 * ProblemDetails `detail` and Retry. Never logs out — only a 401 does, through the global handler.
 */
export function ResourceErrorState({
  error,
  cluster,
  model,
  namespace,
  verb = 'list',
  onRetry,
}: ResourceErrorStateProps) {
  if (isForbidden(error)) {
    return (
      <EmptyState variant="sm" titleText="Restricted access" headingLevel="h2" icon={LockIcon}>
        <EmptyStateBody>
          The service account for {cluster} can&apos;t {verb} {model.plural}
          {scopeText(model, namespace)}.
        </EmptyStateBody>
      </EmptyState>
    );
  }
  return <ErrorState error={error} title={`Could not load ${model.labelPlural}`} onRetry={onRetry} />;
}
