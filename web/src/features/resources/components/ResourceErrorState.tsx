import { EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter } from '@patternfly/react-core';
import { LockIcon, SearchIcon } from '@patternfly/react-icons';
import { Link } from 'react-router';
import { ApiError } from '@/shared/api';
import type { K8sModel } from '@/shared/k8s';
import { ErrorState } from '@/shared/ui';
import { ALL_NAMESPACES, resourcePath } from '../paths';

/** Props for {@link ResourceErrorState}. */
export interface ResourceErrorStateProps {
  error: unknown;
  cluster: string;
  model: K8sModel;
  /** Namespace of the request; {@link ALL_NAMESPACES} for all namespaces; omitted for cluster-scoped kinds. */
  namespace?: string;
  /** Verb named in the "Restricted access" text (default `list`). */
  verb?: 'list' | 'get';
  /**
   * Name of the requested object (details pages). With it, the API server's 404 becomes "`<Kind>` `<name>` not found on
   * `<cluster>`" with a link to the kind's list; without it a 404 is a plain error.
   */
  name?: string;
  /** Retry of the failed query (not offered for 403: retrying won't change RBAC). */
  onRetry: () => void;
}

/** True for the API server's RBAC denial (`Kubernetes.Forbidden`, ADR-0022 §2). */
export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'Kubernetes.Forbidden';
}

/** True for the API server's 404 (`Kubernetes.NotFound`), e.g. an object deleted while its page is open. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'Kubernetes.NotFound';
}

function scopeText(model: K8sModel, namespace: string | undefined): string {
  if (!model.namespaced || namespace === undefined) return '';
  return namespace === ALL_NAMESPACES ? ' in any project' : ` in ${namespace}`;
}

/**
 * Error state of a resource page (UI-10): the API server's 403 becomes "Restricted access" naming the cluster's
 * service account, verb, resource and namespace; a 404 for a named object becomes "not found" with a link to the
 * kind's list (in the object's namespace); anything else (incl. `Proxy.*` 502/504) is an `ErrorState` with the
 * ProblemDetails `detail` and Retry. Never logs out — only a 401 does, through the global handler.
 */
export function ResourceErrorState({
  error,
  cluster,
  model,
  namespace,
  verb = 'list',
  name,
  onRetry,
}: ResourceErrorStateProps) {
  if (name !== undefined && isNotFound(error)) {
    const listPath = resourcePath(cluster, model, { namespace });
    return (
      <EmptyState
        titleText={`${model.label} ${name} not found on ${cluster}`}
        headingLevel="h2"
        icon={SearchIcon}
      >
        <EmptyStateBody>
          It may have been deleted, or it exists on another cluster or in another project.
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Link to={listPath}>
              View {model.labelPlural}
              {model.namespaced && namespace !== undefined ? ` in ${namespace}` : ''}
            </Link>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    );
  }
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
