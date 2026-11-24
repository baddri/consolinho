import { Flex, FlexItem } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { KindBadge } from '@/shared/ui';

/** The fleet kinds of Fleet administration. */
export type AdminKind = 'User' | 'Group' | 'Cluster' | 'Credential';

/**
 * Badge abbreviations of the fleet kinds (`UX.md` §5): OCP's rule (capitals of the kind) in OCP's default colour.
 * Credential applies the rule to what it is, a ClusterCredential ("CC"), so it doesn't collide with Cluster "C"
 * (OCP gives colliding kinds their own `abbr`) nor with OCP's ClusterRole "CR". Group is OCP's own Group "G".
 */
export const ADMIN_KIND_ABBR: Readonly<Record<AdminKind, string>> = {
  User: 'U',
  Group: 'G',
  Cluster: 'C',
  Credential: 'CC',
};

/** Props for {@link AdminResourceName}. */
export interface AdminResourceNameProps {
  kind: AdminKind;
  /** The name: a router link or plain text. */
  children: ReactNode;
}

/**
 * OCP `ResourceLink` layout (`co-resource-item`) for a fleet object: kind badge and name on one line,
 * baseline-aligned. For names without a details page of their own (credentials).
 */
export function AdminResourceName({ kind, children }: AdminResourceNameProps) {
  return (
    <Flex
      gap={{ default: 'gapNone' }}
      flexWrap={{ default: 'nowrap' }}
      alignItems={{ default: 'alignItemsBaseline' }}
    >
      <FlexItem flex={{ default: 'flexNone' }}>
        <KindBadge kind={kind} abbr={ADMIN_KIND_ABBR[kind]} />
      </FlexItem>
      <FlexItem>{children}</FlexItem>
    </Flex>
  );
}

/** Props for {@link AdminResourceLink}. */
export interface AdminResourceLinkProps {
  kind: AdminKind;
  name: string;
  /** Route of the object's page. */
  to: string;
}

/**
 * OCP `ResourceLink` for a fleet object (`UX.md` §5): kind badge + router link named by the object, as in every
 * admin list's Name column and the grants tables.
 */
export function AdminResourceLink({ kind, name, to }: AdminResourceLinkProps) {
  return (
    <AdminResourceName kind={kind}>
      <Link to={to}>{name}</Link>
    </AdminResourceName>
  );
}
