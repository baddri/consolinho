import { ExpandableSection, Label, LabelGroup, List, ListItem } from '@patternfly/react-core';
import { useState } from 'react';
import type { K8sResource } from '@/shared/k8s';
import { DetailsItem } from '@/shared/ui';
import { ObjectReferenceLink } from '../components/ObjectReferenceLink';
import { ResourceLink } from '../components/ResourceLink';
import { Timestamp } from '../components/Timestamp';
import { useNamespaceModel } from './useNamespaceModel';

/** Every label as an outlined grey `key=value` label (OCP `LabelList`); "No labels" without any. */
function Labels({ labels }: { labels: Record<string, string> }) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return <>No labels</>;
  return (
    <LabelGroup numLabels={entries.length} aria-label="Labels">
      {entries.map(([key, value]) => (
        <Label key={key} isCompact variant="outline">
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
 * Left column of the Details tab (UI-4, `UX.md` §6): the metadata every kind shares — name, namespace (link to its
 * project/namespace), labels, annotations, created (absolute, relative in a tooltip) and owner references (links for
 * registered kinds, text otherwise). Renders `DetailsItem`s only; the caller supplies the vertical `DescriptionList`.
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
    <>
      <DetailsItem label="Name">{name}</DetailsItem>
      {namespace !== undefined && (
        <DetailsItem label="Namespace">
          <ResourceLink model={namespaceModel} name={namespace} />
        </DetailsItem>
      )}
      <DetailsItem label="Labels">
        <Labels labels={labels} />
      </DetailsItem>
      <DetailsItem label="Annotations">
        <Annotations annotations={annotations} />
      </DetailsItem>
      <DetailsItem label="Created">
        <Timestamp value={creationTimestamp} />
      </DetailsItem>
      <DetailsItem label="Owner">
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
      </DetailsItem>
    </>
  );
}
