import { ExpandableSection, List, ListItem } from '@patternfly/react-core';
import { useState } from 'react';
import { Link } from 'react-router';
import { NamespaceModel, type K8sResource } from '@/shared/k8s';
import { DetailsItem, kindLabelColor, ResourceLabels, Timestamp } from '@/shared/ui';
import { OwnerReferences } from '../components/ObjectReferenceLink';
import { BadgedName } from '../components/ResourceLink';
import { ALL_NAMESPACES, resourcePath } from '../paths';
import { PodSelectorLink, labelSelectorString } from '../registry/columns';
import type { ResourceDescriptor } from '../registry/types';
import { searchPath } from '../search/searchPath';
import { useNamespaceModel } from './useNamespaceModel';

/** "1 annotation" / "N annotations" (and tolerations): OCP's `{{count}} annotation` plural. */
function countText(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** "N annotations", expandable to the `key=value` list (annotations can be long, so collapsed by default). */
function Annotations({ annotations }: { annotations: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(annotations);
  const count = countText(entries.length, 'annotation');
  if (entries.length === 0) return <>{count}</>;
  return (
    <ExpandableSection
      toggleText={count}
      isExpanded={expanded}
      onToggle={(_event, next) => setExpanded(next)}
    >
      <List isPlain>
        {entries.map(([key, value]) => (
          <ListItem key={key}>
            {key}={value}
          </ListItem>
        ))}
      </List>
    </ExpandableSection>
  );
}

/**
 * A node selector as plain `key=value` text (no Nodes page yet); "No selector" in subtle text without one, as OCP
 * `Selector kind="Node"` (`public/components/utils/selector.tsx`).
 */
function NodeSelector({ selector }: { selector: Record<string, string> | undefined }) {
  const text = labelSelectorString(selector);
  if (text === '') return <div className="pf-v6-u-text-color-subtle">No selector</div>;
  return <>{text.replace(/,/g, ', ')}</>;
}

/** Props for {@link MetadataSection}. */
export interface MetadataSectionProps {
  cluster: string;
  descriptor: ResourceDescriptor;
  obj: K8sResource;
}

/**
 * Left column of the Details tab, OCP `ResourceSummary` (`details-page.tsx`, `UX.md` §6): Name, Namespace (`NS` badge,
 * linking to the project/namespace), Labels (kind-coloured, each linking to Search with it and the kind preselected, SRCH-4), the
 * descriptor's optional Pod selector / Node selector / Tolerations, Annotations, its `Extra` rows, "Created at" and
 * Owner. Renders `DetailsItem`s only; the caller supplies the vertical `DescriptionList`.
 */
export function MetadataSection({ cluster, descriptor, obj }: MetadataSectionProps) {
  const namespaceModel = useNamespaceModel(cluster);
  const { model, summary } = descriptor;
  const { name, namespace, labels = {}, annotations = {}, creationTimestamp } = obj.metadata;
  return (
    <>
      <DetailsItem label="Name">{name}</DetailsItem>
      {namespace !== undefined && (
        <DetailsItem label="Namespace">
          <BadgedName badge={NamespaceModel}>
            <Link to={resourcePath(cluster, namespaceModel, { name: namespace })}>{namespace}</Link>
          </BadgedName>
        </DetailsItem>
      )}
      <DetailsItem label="Labels">
        <ResourceLabels
          labels={labels}
          color={kindLabelColor(model.kind)}
          linkTo={(key, value) =>
            searchPath(cluster, { namespace: namespace ?? ALL_NAMESPACES, kinds: [model], labels: [`${key}=${value}`] })
          }
        />
      </DetailsItem>
      {summary?.podSelector && (
        <DetailsItem label="Pod selector">
          <PodSelectorLink namespace={namespace} matchLabels={summary.podSelector(obj)} />
        </DetailsItem>
      )}
      {summary?.nodeSelector && (
        <DetailsItem label="Node selector">
          <NodeSelector selector={summary.nodeSelector(obj)} />
        </DetailsItem>
      )}
      {summary?.tolerations && (
        <DetailsItem label="Tolerations">
          {countText(summary.tolerations(obj)?.length ?? 0, 'toleration')}
        </DetailsItem>
      )}
      <DetailsItem label="Annotations">
        <Annotations annotations={annotations} />
      </DetailsItem>
      {/* Rendered as a component (not called) so it may use hooks. */}
      {summary?.Extra && <summary.Extra obj={obj} />}
      <DetailsItem label="Created at">
        <Timestamp value={creationTimestamp} />
      </DetailsItem>
      <DetailsItem label="Owner">
        <OwnerReferences obj={obj} />
      </DetailsItem>
    </>
  );
}
