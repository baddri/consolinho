import {
  Bullseye,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Skeleton,
  Stack,
  StackItem,
  Tab,
  TabContent,
  Tabs,
  TabTitleText,
} from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router';
import { apiVersionOf, useK8sDiscovery, useK8sGet, type K8sResource } from '@/shared/k8s';
import { ResourceActionsMenu } from '../actions/ResourceActionsMenu';
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
const TAB_TITLES: Record<ResourceTab, string> = { details: 'Details', yaml: 'YAML', events: 'Events' };

/** DOM id of a tab's panel, referenced by the tab's `aria-controls`. */
const panelId = (tab: ResourceTab) => `resource-${tab}-panel`;

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
  if (tab === 'events' && descriptor.hasEventsTab === false) {
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
 * Header and tabs of one live object (`useK8sGet`). `error` is checked before `data`: after a DELETED event TanStack
 * keeps the stale object next to the 404 (ADR-0022 §6), which must show the not-found state.
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
      <ResourceHeader
        cluster={cluster}
        model={model}
        namespace={namespace}
        name={name}
        status={obj && descriptor.status?.(obj)}
        actions={
          obj && (
            <ResourceActionsMenu cluster={cluster} descriptor={descriptor} namespace={namespace} name={name} />
          )
        }
      />
      {body}
    </>
  );
}

/** URL-driven Details · YAML · Events tabs (Events hidden when `hasEventsTab === false`); selecting one navigates. */
function ResourceTabs({
  descriptor,
  cluster,
  namespace,
  name,
  tab,
  children,
}: ResourceDetailsProps & { children: ReactNode }) {
  const navigate = useNavigate();
  const { model } = descriptor;
  const tabs = RESOURCE_TABS.filter((key) => key !== 'events' || descriptor.hasEventsTab !== false);
  return (
    <>
      <PageSection type="tabs">
        <Tabs
          activeKey={tab}
          onSelect={(_event, key) => {
            const next = tabs.find((candidate) => candidate === key);
            if (next && next !== tab) {
              void navigate(
                resourcePath(cluster, model, { namespace, name, tab: next === 'details' ? undefined : next }),
              );
            }
          }}
          aria-label={`${model.label} tabs`}
        >
          {tabs.map((key) => (
            <Tab
              key={key}
              eventKey={key}
              title={<TabTitleText>{TAB_TITLES[key]}</TabTitleText>}
              tabContentId={panelId(key)}
            />
          ))}
        </Tabs>
      </PageSection>
      <PageSection>
        <TabContent id={panelId(tab)} eventKey={tab} activeKey={tab} aria-label={TAB_TITLES[tab]}>
          {children}
        </TabContent>
      </PageSection>
    </>
  );
}
