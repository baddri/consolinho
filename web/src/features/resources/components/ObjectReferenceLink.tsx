import { descriptorForKind } from '../registry/registry';
import { BadgedName, ResourceLink } from './ResourceLink';

/** Props for {@link ObjectReferenceLink}. */
export interface ObjectReferenceLinkProps {
  apiVersion: string | undefined;
  kind: string | undefined;
  name: string | undefined;
  namespace?: string;
}

/** OCP's `kindToAbbr`: the kind's capitals, at most four (`ReplicaSet` → `RS`), else its first letter. */
export function kindAbbr(kind: string): string {
  return kind.replace(/[^A-Z]/g, '').slice(0, 4) || kind.charAt(0).toUpperCase();
}

/**
 * A reference to another object (owner reference, event's involved object): a {@link ResourceLink} when its kind is in
 * the registry, else the badge (kind as its hover title) + plain name (spec UI-3 "link if kind registered"); "—" without a name.
 */
export function ObjectReferenceLink({ apiVersion, kind, name, namespace }: ObjectReferenceLinkProps) {
  if (!name) return <>—</>;
  const descriptor = apiVersion && kind ? descriptorForKind(apiVersion, kind) : undefined;
  if (!descriptor) return <BadgedName badge={kind ? { abbr: kindAbbr(kind), label: kind } : undefined}>{name}</BadgedName>;
  return <ResourceLink model={descriptor.model} name={name} namespace={namespace} />;
}
