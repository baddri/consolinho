import { Link } from 'react-router';
import { NamespaceModel, type K8sResource } from '@/shared/k8s';
import { DetailsItem, InlineEditButton, kindLabelColor, ResourceLabels, Timestamp } from '@/shared/ui';
import { OwnerReferences } from '../components/ObjectReferenceLink';
import { BadgedName } from '../components/ResourceLink';
import { ALL_NAMESPACES, resourcePath } from '../paths';
import { PodSelectorLink, labelSelectorString } from '../registry/columns';
import type { ResourceDescriptor } from '../registry/types';
import { searchPath } from '../search/searchPath';
import { useMetadataEdit } from './useMetadataEdit';
import { useNamespaceModel } from './useNamespaceModel';

/** "1 annotation" / "N annotations" (and tolerations): OCP's `{{count}} annotation` plural. */
function countText(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * A node selector as plain `key=value` text (no Nodes page yet); "No selector" in subtle text without one, as OCP
 * `Selector kind="Node"` (`public/components/utils/selector.tsx`).
 */
function NodeSelector({ selector }: { selector: Record<string, string> | undefined }) {
  const text = labelSelectorString({ matchLabels: selector });
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
 * Owner. With `patch` access, Labels has OCP's inline "Edit" and the annotation count is a link, both opening the
 * Actions menu's modals; otherwise both are plain. Tolerations stay a plain count (no tolerations modal yet).
 * Renders `DetailsItem`s (and the open modal) only; the caller supplies the vertical `DescriptionList`.
 */
export function MetadataSection({ cluster, descriptor, obj }: MetadataSectionProps) {
  const namespaceModel = useNamespaceModel(cluster);
  const { model, summary } = descriptor;
  const { name, namespace, labels = {}, annotations = {}, creationTimestamp } = obj.metadata;
  // OCP `getTolerationsPath` / `PodResourceSummary`: a Pod's own spec, every other kind's pod template.
  const podSpecPath = model.kind === 'Pod' ? 'spec' : 'spec.template.spec';
  const edit = useMetadataEdit(cluster, model, obj);
  const annotationCount = countText(Object.keys(annotations).length, 'annotation');
  return (
    <>
      <DetailsItem label="Name" path="metadata.name">
        {name}
      </DetailsItem>
      {namespace !== undefined && (
        <DetailsItem label="Namespace" path="metadata.namespace">
          <BadgedName badge={NamespaceModel}>
            <Link to={resourcePath(cluster, namespaceModel, { name: namespace })}>{namespace}</Link>
          </BadgedName>
        </DetailsItem>
      )}
      <DetailsItem label="Labels" path="metadata.labels" onEdit={edit.canEdit ? edit.openLabels : undefined}>
        {/* OCP boxes the labels (`co-editable-label-group`) only when they are editable. */}
        <ResourceLabels
          isBoxed={edit.canEdit}
          labels={labels}
          color={kindLabelColor(model.kind)}
          linkTo={(key, value) =>
            searchPath(cluster, {
              namespace: namespace ?? ALL_NAMESPACES,
              kinds: [model],
              labels: [`${key}=${value}`],
            })
          }
        />
      </DetailsItem>
      {summary?.podSelector && (
        <DetailsItem label="Pod selector" path="spec.selector">
          <PodSelectorLink namespace={namespace} selector={summary.podSelector(obj)} />
        </DetailsItem>
      )}
      {summary?.nodeSelector && (
        <DetailsItem label="Node selector" path={`${podSpecPath}.nodeSelector`}>
          <NodeSelector selector={summary.nodeSelector(obj)} />
        </DetailsItem>
      )}
      {summary?.tolerations && (
        <DetailsItem label="Tolerations" path={`${podSpecPath}.tolerations`}>
          {countText(summary.tolerations(obj)?.length ?? 0, 'toleration')}
        </DetailsItem>
      )}
      <DetailsItem label="Annotations" path="metadata.annotations">
        {edit.canEdit ? (
          <InlineEditButton onClick={edit.openAnnotations}>{annotationCount}</InlineEditButton>
        ) : (
          annotationCount
        )}
      </DetailsItem>
      {/* Rendered as a component (not called) so it may use hooks. */}
      {summary?.Extra && <summary.Extra obj={obj} />}
      <DetailsItem label="Created at" path="metadata.creationTimestamp">
        <Timestamp value={creationTimestamp} />
      </DetailsItem>
      <DetailsItem label="Owner" path="metadata.ownerReferences">
        <OwnerReferences obj={obj} />
      </DetailsItem>
      {edit.dialog}
    </>
  );
}
