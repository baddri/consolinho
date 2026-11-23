import {
  Accordion,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Toolbar,
  ToolbarContent,
  ToolbarFilter,
  ToolbarItem,
  type ToolbarLabel,
} from '@patternfly/react-core';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { apiVersionOf, useK8sDiscovery } from '@/shared/k8s';
import { PageHeading } from '@/shared/ui';
import { KindBadge } from '../components/KindBadge';
import { ProjectBar } from '../components/ProjectBar';
import { ALL_NAMESPACES } from '../paths';
import { descriptorForKind, resourceDescriptors } from '../registry/registry';
import type { ResourceDescriptor } from '../registry/types';
import { fromRef } from './kindRef';
import { ResourceKindSelect } from './ResourceKindSelect';
import { SearchFilterInput } from './SearchFilterInput';
import styles from './SearchPage.module.css';
import { searchPath } from './searchPath';
import { SearchResultSection } from './SearchResultSection';
import { useSearchFilters } from './useSearchFilters';

/** A selected kind the page can show: its reference and registry descriptor. */
interface SelectedKind {
  ref: string;
  descriptor: ResourceDescriptor;
}

/**
 * Home → Search (SRCH-1/2/3/5, OCP `search.tsx`) at `search/ns/:namespace` and `search/all-namespaces`: the project
 * bar, the toolbar (resource kinds, Label/Name filter, their chips and "Clear all filters") and one accordion section
 * per selected kind with its one-shot results. All filters live in OCP's URL parameters (`?kind=&q=&name=`). Only
 * kinds with a registry page that the cluster serves are offered; references to other kinds stay in the URL (e.g.
 * after a cluster switch) but render nothing. Lazy-loaded by `routes.tsx`.
 */
export function SearchPage() {
  const { cluster = '', namespace = ALL_NAMESPACES } = useParams();
  const discovery = useK8sDiscovery(cluster);
  const filters = useSearchFilters();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const offered = useMemo(
    () => resourceDescriptors().filter(({ model }) => discovery.isServed(model)),
    [discovery],
  );
  const selected = useMemo(
    () =>
      filters.kinds.flatMap((ref): SelectedKind[] => {
        const model = fromRef(ref);
        const descriptor = model && descriptorForKind(apiVersionOf(model), model.kind);
        return descriptor && discovery.isServed(model) ? [{ ref, descriptor }] : [];
      }),
    [filters.kinds, discovery],
  );
  const labelSelector = filters.labels.join(',');

  const toggleCollapsed = (ref: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(ref)) next.add(ref);
      return next;
    });

  const kindLabels: ToolbarLabel[] = selected.map(({ ref, descriptor: { model } }) => ({
    key: ref,
    node: (
      <span className={styles.kindOption}>
        <KindBadge model={model} />
        {model.label}
      </span>
    ),
  }));

  return (
    <>
      <ProjectBar
        cluster={cluster}
        namespace={namespace}
        pathFor={(next, search) => searchPath(cluster, next ?? ALL_NAMESPACES, search)}
      />
      <PageHeading title="Search" />
      <PageSection hasBodyWrapper={false}>
        <Toolbar
          clearAllFilters={filters.clearAll}
          collapseListedFiltersBreakpoint="xl"
          clearFiltersButtonText="Clear all filters"
        >
          <ToolbarContent>
            <ToolbarItem>
              <ToolbarFilter
                categoryName="Resource"
                labels={kindLabels}
                deleteLabel={(_category, label) => {
                  if (typeof label !== 'string') filters.toggleKind(label.key);
                }}
                deleteLabelGroup={filters.clearKinds}
              >
                <ResourceKindSelect
                  models={offered.map(({ model }) => model)}
                  selected={selected.map(({ ref }) => ref)}
                  onToggle={filters.toggleKind}
                />
              </ToolbarFilter>
            </ToolbarItem>
            <ToolbarItem className={styles.filter}>
              <ToolbarFilter
                categoryName="Label"
                labels={filters.labels}
                deleteLabel={(_category, label) => {
                  if (typeof label === 'string') filters.removeLabel(label);
                }}
                deleteLabelGroup={filters.clearLabels}
              >
                <ToolbarFilter
                  categoryName="Name"
                  labels={filters.nameInput === '' ? [] : [filters.nameInput]}
                  deleteLabel={filters.clearName}
                >
                  <SearchFilterInput
                    nameInput={filters.nameInput}
                    onNameChange={filters.setNameInput}
                    onAddLabel={filters.addLabel}
                  />
                </ToolbarFilter>
              </ToolbarFilter>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
        {selected.length > 0 && (
          <Accordion asDefinitionList={false}>
            {selected.map(({ ref, descriptor }) => (
              <SearchResultSection
                key={ref}
                kindRef={ref}
                descriptor={descriptor}
                cluster={cluster}
                namespace={namespace}
                labelSelector={labelSelector}
                name={filters.name}
                isExpanded={!collapsed.has(ref)}
                onToggle={() => toggleCollapsed(ref)}
              />
            ))}
          </Accordion>
        )}
        {selected.length === 0 && (
          // OCP `ConsoleEmptyState`: small variant, extra top padding from `md`.
          <EmptyState
            variant="sm"
            className="pf-v6-u-pt-xl-on-md"
            titleText="No resources selected"
            headingLevel="h2"
          >
            <EmptyStateBody>Select one or more resources from the dropdown.</EmptyStateBody>
          </EmptyState>
        )}
      </PageSection>
    </>
  );
}
