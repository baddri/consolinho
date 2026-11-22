import {
  Bullseye,
  EmptyState,
  EmptyStateBody,
  PageGroup,
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
import type { ResourceDetailsContext } from './detailsContext';
import { ResourceHeader } from './ResourceHeader';
import { RESOURCE_TABS, useResourceTab, type ResourceTab } from './useResourceTab';

/** Tab titles, also the accessible names of their panels. No Logs/Terminal before CP4 (spec §5). */
const TAB_TITLES: Record<ResourceTab, string> = {
  details: 'Details',
  yaml: 'YAML',
  pods: 'Pods',
  events: 'Events',
};

/** Whether `descriptor`'s details page has the tab `tab` (Pods only with a pod selector; Events unless opted out). */
function hasTab(descriptor: ResourceDescriptor, tab: ResourceTab): boolean {
  if (tab === 'pods') return descriptor.podsSelector !== undefined;
  if (tab === 'events') return descriptor.hasEventsTab !== false;
  return true;
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
 * Details layout of every registered kind (UI-4/5/10, ADR-0023 §1) at `k8s/ns/:namespace/:plural/:name[/yaml|/events]`
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
        actions={
          obj && (
            <ResourceActionsMenu
              cluster={cluster}
              descriptor={descriptor}
              namespace={namespace}
              name={name}
            />
          )
        }
      />
      {body}
    </>
  );
}

/**
 * URL-driven Details · YAML · Pods · Events tabs (Pods only with a `podsSelector`, Events unless `hasEventsTab ===
 * false`) as `PageTabs` aligned with the heading, then the active tab's content labelled by the tab: Details in a
 * `PageGroup` of its own bordered sections, YAML in a filled unpadded section (the editor reaches the bottom), the
 * others in a `PageBody`.
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
      {tab === 'details' ? (
        // The Details tab renders its own bordered sections (`DetailsSubsection`, OCP `PaneBody`s).
        <PageGroup role="tabpanel" aria-label={TAB_TITLES[tab]}>
          {children}
        </PageGroup>
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
        <PageBody role="tabpanel" aria-label={TAB_TITLES[tab]}>
          {children}
        </PageBody>
      )}
    </>
  );
}
