import {
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  ExpandableSection,
  Label,
  LabelGroup,
  List,
  ListItem,
} from '@patternfly/react-core';
import { useState } from 'react';
import type { K8sResource } from '@/shared/k8s';
import { RelativeTime } from '@/shared/ui';
import { ObjectReferenceLink } from '../components/ObjectReferenceLink';
import { ResourceLink } from '../components/ResourceLink';
import { useNamespaceModel } from './useNamespaceModel';

/** Every label as a `key=value` chip; "No labels" without any. */
function Labels({ labels }: { labels: Record<string, string> }) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return <>No labels</>;
  return (
    <LabelGroup numLabels={entries.length} aria-label="Labels">
      {entries.map(([key, value]) => (
        <Label key={key} isCompact color="blue">
          {key}={value}
        </Label>
      ))}
    </LabelGroup>
  );
}

/** "N annotations", expandable to the `key=value` list (annotations can be long, so collapsed by default). */
function Annotations({ annotations }: { annotations: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(annotations);
  const count = `${entries.length} ${entries.length === 1 ? 'annotation' : 'annotations'}`;
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

/** Props for {@link MetadataSection}. */
export interface MetadataSectionProps {
  cluster: string;
  obj: K8sResource;
}

/**
 * The metadata every kind shares (UI-4): name, namespace (link to its project/namespace), labels, annotations, created
 * and owner references (links for registered kinds, text otherwise).
 */
export function MetadataSection({ cluster, obj }: MetadataSectionProps) {
  const namespaceModel = useNamespaceModel(cluster);
  const {
    name,
    namespace,
    labels = {},
    annotations = {},
    creationTimestamp,
    ownerReferences = [],
  } = obj.metadata;
  return (
    <DescriptionList aria-label="Metadata">
      <DescriptionListGroup>
        <DescriptionListTerm>Name</DescriptionListTerm>
        <DescriptionListDescription>{name}</DescriptionListDescription>
      </DescriptionListGroup>
      {namespace !== undefined && (
        <DescriptionListGroup>
          <DescriptionListTerm>Namespace</DescriptionListTerm>
          <DescriptionListDescription>
            <ResourceLink model={namespaceModel} name={namespace} />
          </DescriptionListDescription>
        </DescriptionListGroup>
      )}
      <DescriptionListGroup>
        <DescriptionListTerm>Labels</DescriptionListTerm>
        <DescriptionListDescription>
          <Labels labels={labels} />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Annotations</DescriptionListTerm>
        <DescriptionListDescription>
          <Annotations annotations={annotations} />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Created</DescriptionListTerm>
        <DescriptionListDescription>
          <RelativeTime value={creationTimestamp ?? null} />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Owner</DescriptionListTerm>
        <DescriptionListDescription>
          {ownerReferences.length === 0 ? (
            'No owner'
          ) : (
            <List isPlain>
              {ownerReferences.map((owner) => (
                <ListItem key={owner.uid}>
                  <ObjectReferenceLink
                    apiVersion={owner.apiVersion}
                    kind={owner.kind}
                    name={owner.name}
                    namespace={namespace}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  );
}
