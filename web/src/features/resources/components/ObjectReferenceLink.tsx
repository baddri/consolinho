import type { K8sResource } from '@/shared/k8s';
import { kindAbbr } from '@/shared/ui';
import { descriptorForKind } from '../registry/registry';
import { BadgedName, ResourceLink } from './ResourceLink';

/** Props for {@link ObjectReferenceLink}. */
export interface ObjectReferenceLinkProps {
  apiVersion: string | undefined;
  kind: string | undefined;
  name: string | undefined;
  namespace?: string;
}

/**
 * A reference to another object (owner reference, event's involved object): a {@link ResourceLink} when its kind is in
 * the registry, else the badge (kind as its hover title) + plain name (spec UI-3 "link if kind registered"); "—" without a name.
 */
export function ObjectReferenceLink({ apiVersion, kind, name, namespace }: ObjectReferenceLinkProps) {
  if (!name) return <>—</>;
  const descriptor = apiVersion && kind ? descriptorForKind(apiVersion, kind) : undefined;
  if (!descriptor)
    return <BadgedName badge={kind ? { abbr: kindAbbr(kind), kind } : undefined}>{name}</BadgedName>;
  return <ResourceLink model={descriptor.model} name={name} namespace={namespace} />;
}

/**
 * Every owner of `obj` as a kind-badge link (OCP `public/components/utils/owner-references.tsx`), inline one after
 * another; "No owner" in subtle text without any. Used by the Pods list's Owner column.
 */
export function OwnerReferences({ obj }: { obj: K8sResource }) {
  const owners = obj.metadata.ownerReferences ?? [];
  if (owners.length === 0) return <span className="pf-v6-u-text-color-subtle">No owner</span>;
  return (
    <>
      {owners.map((owner) => (
        <ObjectReferenceLink
          key={owner.uid}
          apiVersion={owner.apiVersion}
          kind={owner.kind}
          name={owner.name}
          namespace={obj.metadata.namespace}
        />
      ))}
    </>
  );
}
