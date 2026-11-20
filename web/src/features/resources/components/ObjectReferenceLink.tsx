import { descriptorForKind } from '../registry/registry';
import { ResourceLink } from './ResourceLink';

/** Props for {@link ObjectReferenceLink}. */
export interface ObjectReferenceLinkProps {
  apiVersion: string | undefined;
  kind: string | undefined;
  name: string | undefined;
  namespace?: string;
}

/**
 * A reference to another object (owner reference, event's involved object): a {@link ResourceLink} when its kind is in
 * the registry, else plain `Kind name` text (spec UI-3 "link if kind registered"); "—" without a name.
 */
export function ObjectReferenceLink({ apiVersion, kind, name, namespace }: ObjectReferenceLinkProps) {
  if (!name) return <>—</>;
  const descriptor = apiVersion && kind ? descriptorForKind(apiVersion, kind) : undefined;
  if (!descriptor) return <>{kind ? `${kind} ${name}` : name}</>;
  return <ResourceLink model={descriptor.model} name={name} namespace={namespace} />;
}
