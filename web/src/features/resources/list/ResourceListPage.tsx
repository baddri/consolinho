import { Bullseye, EmptyState, EmptyStateBody, PageSection } from '@patternfly/react-core';
import { Navigate, useLocation } from 'react-router';
import { apiVersionOf, useK8sDiscovery } from '@/shared/k8s';
import { PageBody, PageHeading } from '@/shared/ui';
import { ProjectBar } from '../components/ProjectBar';
import { EventsPage } from '../events/EventsPage';
import { ResourcePageSkeleton } from '../components/ResourcePageSkeleton';
import { ALL_NAMESPACES, resourcePath } from '../paths';
import { descriptorForPlural } from '../registry/registry';
import type { ResourceDescriptor } from '../registry/types';
import { useResourceRoute, type ListScope } from '../resourceRoute';
import { LiveIndicator } from './LiveIndicator';
import { useResourceDataView } from './ResourceDataView';

/** Full-page empty state (unsupported or unserved kind). */
function PageEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <PageSection>
      <Bullseye>
        <EmptyState titleText={title} headingLevel="h1">
          <EmptyStateBody>{body}</EmptyStateBody>
        </EmptyState>
      </Bullseye>
    </PageSection>
  );
}

/**
 * Generic live list page (ADR-0023, UI-1..3, UI-10) for `k8s/all-namespaces/:plural`, `k8s/ns/:namespace/:plural` and
 * `k8s/cluster/:plural`. Resolves the descriptor and discovery first: unknown plural → "Kind not supported yet", kind
 * not served by the cluster → "… aren't available", a plural under the wrong scope → redirect to the right shape.
 * Lazy-loaded by `routes.tsx`.
 */
export function ResourceListPage() {
  const { cluster, plural, scope, namespace } = useResourceRoute();
  const { search } = useLocation();
  const discovery = useK8sDiscovery(cluster);
  const descriptor = descriptorForPlural(plural);

  if (!descriptor) {
    return (
      <PageEmptyState title="Kind not supported yet" body={`The console has no page for "${plural}" yet.`} />
    );
  }
  const { model } = descriptor;
  if (model.namespaced && scope === 'cluster') {
    return <Navigate replace to={resourcePath(cluster, model, { namespace: ALL_NAMESPACES, search })} />;
  }
  if (!model.namespaced && scope !== 'cluster') {
    return <Navigate replace to={resourcePath(cluster, model, { search })} />;
  }
  if (!discovery.isServed(model)) {
    return discovery.isPending ? (
      <ResourcePageSkeleton />
    ) : (
      <PageEmptyState
        title={`${model.labelPlural} aren't available on ${cluster}`}
        body={`This cluster doesn't serve ${apiVersionOf(model)}.`}
      />
    );
  }
  const key = `${cluster}|${plural}|${namespace ?? ''}`;
  if (descriptor.listLayout === 'eventStream') {
    return <EventsPage key={key} descriptor={descriptor} cluster={cluster} namespace={namespace} />;
  }
  // Remount per list so sort, page and the label draft start fresh on another kind, namespace or cluster.
  return (
    <ResourceList
      key={key}
      descriptor={descriptor}
      cluster={cluster}
      scope={scope}
      namespace={namespace}
    />
  );
}

interface ResourceListProps {
  descriptor: ResourceDescriptor;
  cluster: string;
  scope: ListScope;
  /** A namespace, {@link ALL_NAMESPACES}, or `undefined` (cluster-scoped). */
  namespace: string | undefined;
}

/** Project bar, heading and the live {@link useResourceDataView} of one kind's list page. */
function ResourceList({ descriptor, cluster, scope, namespace }: ResourceListProps) {
  const { model } = descriptor;
  const { liveStatus, dataView } = useResourceDataView({
    descriptor,
    cluster,
    scope,
    namespace,
    // OLM-1: e.g. `!olm.copiedFrom`, so each operator is listed once across namespaces.
    fixedSelector: scope === 'all' ? descriptor.allNamespacesLabelSelector : undefined,
  });
  return (
    <>
      {model.namespaced && <ProjectBar descriptor={descriptor} cluster={cluster} namespace={namespace} />}
      <PageHeading
        title={model.labelPlural}
        status={liveStatus === 'paused' ? <LiveIndicator status={liveStatus} /> : undefined}
        alert={descriptor.HeadingAlert && <descriptor.HeadingAlert cluster={cluster} />}
        actions={descriptor.ListActions && <descriptor.ListActions cluster={cluster} />}
      />
      <PageBody>{dataView}</PageBody>
    </>
  );
}
