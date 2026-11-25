import {
  Bullseye,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';
import { apiVersionOf, useK8sDiscovery, useK8sGet, type K8sResource } from '@/shared/k8s';
import { PageBody, PageTabs } from '@/shared/ui';
import { ResourceActionsMenu } from '../actions/ResourceActionsMenu';
import { ProjectBar } from '../components/ProjectBar';
import { ResourceErrorState } from '../components/ResourceErrorState';
import { ResourcePageSkeleton } from '../components/ResourcePageSkeleton';
import { ALL_NAMESPACES, resourcePath } from '../paths';
import { descriptorForPlural } from '../registry/registry';
import type { ResourceDescriptor } from '../registry/types';
import { useResourceRoute } from '../resourceRoute';
import { useResourceDetails, type ResourceDetailsContext } from './detailsContext';
import { ResourceHeader } from './ResourceHeader';
import { RESOURCE_TABS, useResourceTab, type ResourceTab } from './useResourceTab';

/** Tab titles, also the accessible names of their panels (OCP copy). */
const TAB_TITLES: Record<ResourceTab, string> = {
  details: 'Details',
  yaml: 'YAML',
  replicasets: 'ReplicaSets',
  replicationcontrollers: 'ReplicationControllers',
  machines: 'Machines',
  subscription: 'Subscription',
  'related-objects': 'Related objects',
  pods: 'Pods',
  jobs: 'Jobs',
  logs: 'Logs',
  events: 'Events',
  terminal: 'Terminal',
};

/**
 * Whether `descriptor`'s details page has the tab `tab`: Pods only with a pod selector, Events unless opted out, the
 * kind tabs (ReplicaSets, ReplicationControllers, Jobs, Logs, Terminal) only when listed in `extraTabs` (ADR-0037 §2),
 * the descriptor-owned ones (Machines, Subscription, Related objects) only when also given a `KindTabs` component.
 */
function hasTab(descriptor: ResourceDescriptor, tab: ResourceTab): boolean {
  switch (tab) {
    case 'pods':
      return descriptor.podsSelector !== undefined || descriptor.PodsTab !== undefined;
    case 'events':
      return descriptor.hasEventsTab !== false;
    case 'replicasets':
    case 'replicationcontrollers':
    case 'jobs':
    case 'logs':
    case 'terminal':
      return descriptor.extraTabs?.includes(tab) ?? false;
    case 'machines':
    case 'subscription':
    case 'related-objects':
      return (descriptor.extraTabs?.includes(tab) ?? false) && descriptor.KindTabs?.[tab] !== undefined;
    default:
      return true;
  }
}

/**
 * Body of a descriptor-owned kind tab (Machines, Subscription, Related objects): the descriptor's `KindTabs` component
 * for the active tab. Lazy route module of those tabs; `hasTab` has already redirected when the component is missing.
 */
export function ResourceKindTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  const tab = useResourceTab();
  const kindTab = tab === 'machines' || tab === 'subscription' || tab === 'related-objects' ? tab : undefined;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- rendered as a component, never called on `this`
  const Tab = kindTab ? descriptor.KindTabs?.[kindTab] : undefined;
  return Tab ? <Tab cluster={cluster} obj={obj} /> : null;
}

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
 * Details layout of every registered kind (UI-4/5/10, ADR-0023 §1) at `k8s/ns/:namespace/:plural/:name[/<tab>]`
 * and `k8s/cluster/:plural/:name[/…]`. Resolves the descriptor like the list page (unknown plural → "Kind not supported
 * yet", wrong scope → redirect, unserved → "aren't available"), then renders {@link ResourceDetails}. Lazy-loaded by
 * `routes.tsx`; the tab panels are its lazy child routes.
 */
export function ResourceDetailsPage() {
  const { cluster, plural, scope, namespace, name = '' } = useResourceRoute();
  const tab = useResourceTab();
  const discovery = useK8sDiscovery(cluster);
  const descriptor = descriptorForPlural(plural);

  if (!descriptor) {
    return (
      <PageEmptyState title="Kind not supported yet" body={`The console has no page for "${plural}" yet.`} />
    );
  }
  const { model } = descriptor;
  if (model.namespaced && scope === 'cluster') {
    return <Navigate replace to={resourcePath(cluster, model, { namespace: ALL_NAMESPACES })} />;
  }
  if (!model.namespaced && scope !== 'cluster') {
    return (
      <Navigate
        replace
        to={resourcePath(cluster, model, { name, tab: tab === 'details' ? undefined : tab })}
      />
    );
  }
  if (!hasTab(descriptor, tab)) {
    return <Navigate replace to={resourcePath(cluster, model, { namespace, name })} />;
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
  // Remount per object so a cluster switch (SW-9) never shows the previous cluster's object while loading.
  return (
    <ResourceDetails
      key={`${cluster}|${plural}|${namespace ?? ''}|${name}`}
      cluster={cluster}
      descriptor={descriptor}
      namespace={namespace}
      name={name}
      tab={tab}
    />
  );
}

interface ResourceDetailsProps {
  cluster: string;
  descriptor: ResourceDescriptor;
  namespace: string | undefined;
  name: string;
  tab: ResourceTab;
}

/**
 * Project bar (namespaced kinds), heading and tabs of one live object (`useK8sGet`). `error` is checked before
 * `data`: after a DELETED event TanStack keeps the stale object next to the 404 (ADR-0022 §6), which must show the
 * not-found state.
 */
function ResourceDetails({ cluster, descriptor, namespace, name, tab }: ResourceDetailsProps) {
  const { model } = descriptor;
  const result = useK8sGet<K8sResource>(cluster, model, namespace, name);
  const obj = result.error ? undefined : result.data;

  let body;
  if (result.error) {
    body = (
      <PageSection>
        <ResourceErrorState
          error={result.error}
          cluster={cluster}
          model={model}
          namespace={namespace}
          name={name}
          verb="get"
          onRetry={() => result.refetch()}
        />
      </PageSection>
    );
  } else if (!obj) {
    body = (
      <PageSection>
        <Stack hasGutter>
          <StackItem>
            <Skeleton width="40%" screenreaderText={`Loading ${model.label} ${name}`} />
          </StackItem>
          <StackItem>
            <Skeleton height="200px" />
          </StackItem>
        </Stack>
      </PageSection>
    );
  } else {
    const context: ResourceDetailsContext = { cluster, descriptor, obj };
    body = (
      <ResourceTabs descriptor={descriptor} cluster={cluster} namespace={namespace} name={name} tab={tab}>
        <Outlet context={context} />
      </ResourceTabs>
    );
  }

  return (
    <>
      {model.namespaced && <ProjectBar descriptor={descriptor} cluster={cluster} namespace={namespace} />}
      <ResourceHeader
        cluster={cluster}
        model={model}
        namespace={namespace}
        name={name}
        status={obj && !descriptor.hideHeadingStatus ? descriptor.status?.(obj) : undefined}
        listTo={descriptor.listPath?.(cluster)}
        crumbs={descriptor.detailsCrumbs}
        heading={obj && descriptor.detailsHeading?.(obj)}
        actions={obj && <ResourceActionsMenu cluster={cluster} descriptor={descriptor} obj={obj} />}
        alert={descriptor.HeadingAlert && <descriptor.HeadingAlert cluster={cluster} />}
      />
      {body}
    </>
  );
}

/**
 * URL-driven tabs in `RESOURCE_TABS` order, filtered by {@link hasTab}, as `PageTabs` aligned with the heading, then
 * the active tab's content labelled by the tab: Details and Subscription in a plain element around their own bordered
 * sections, YAML in a
 * filled unpadded section (the editor reaches the bottom), Logs and Terminal in a filled `PageBody`, the others in a
 * `PageBody`.
 */
function ResourceTabs({
  descriptor,
  cluster,
  namespace,
  name,
  tab,
  children,
}: ResourceDetailsProps & { children: ReactNode }) {
  const { model } = descriptor;
  const tabs = RESOURCE_TABS.filter((key) => hasTab(descriptor, key)).map((key) => ({
    key,
    title: TAB_TITLES[key],
    to: resourcePath(cluster, model, { namespace, name, tab: key === 'details' ? undefined : key }),
  }));
  return (
    <>
      <PageTabs tabs={tabs} activeKey={tab} aria-label={`${model.label} tabs`} />
      {tab === 'details' || tab === 'subscription' ? (
        // Details and Subscription (OCP `SubscriptionDetails`: two `PaneBody`s) render their own bordered sections
        // (`DetailsSubsection`, OCP `PaneBody`s). A plain element: PageGroup drops `aria-label` unless it scrolls.
        <div role="tabpanel" aria-label={TAB_TITLES[tab]}>
          {children}
        </div>
      ) : tab === 'yaml' ? (
        // OCP's YAML tab sits in an unpadded, filled page body; the editor insets itself (`_edit-yaml.scss`).
        <PageSection
          isFilled
          hasBodyWrapper={false}
          padding={{ default: 'noPadding' }}
          role="tabpanel"
          aria-label={TAB_TITLES[tab]}
        >
          {children}
        </PageSection>
      ) : (
        // Logs and Terminal fill the page like OCP's `PaneBody fullHeight` (the viewer/terminal reach the bottom).
        <PageBody
          isFilled={tab === 'logs' || tab === 'terminal'}
          role="tabpanel"
          aria-label={TAB_TITLES[tab]}
        >
          {children}
        </PageBody>
      )}
    </>
  );
}
