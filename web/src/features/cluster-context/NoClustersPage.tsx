import {
  Button,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
} from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';
import { Link, type LinkProps } from 'react-router';
import { useCurrentUser } from '@/features/auth';

/** Router link to the admin users list that PatternFly's `Button` can render as. */
function AdminUsersLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/admin/users" />;
}

/**
 * Landing page for a signed-in user without any cluster (SW-4). Admins additionally get a way into Fleet administration and
 * the reminder that the Admin role alone grants no cluster access (GRANT-6), with a link to their own access tab —
 * or, for a read-only admin who cannot grant, the advice to ask another administrator.
 * Rendered inside `RequireSession`, so `me` is loaded.
 */
export function NoClustersPage() {
  const { data: me } = useCurrentUser();
  const username = me?.username ?? '';
  const isAdmin = me?.role === 'admin';

  return (
    <PageSection>
      <EmptyState titleText="No clusters assigned yet" headingLevel="h1" icon={CubesIcon}>
        <EmptyStateBody>
          You are logged in as <strong>{username}</strong>, but no clusters have been assigned to you. Ask a
          FleetConsole administrator to grant you access.
        </EmptyStateBody>
        {isAdmin && (
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" component={AdminUsersLink}>
                Go to Fleet administration
              </Button>
            </EmptyStateActions>
            {me.isReadOnly ? (
              // A read-only admin (ADM-2) cannot create grants, not even for themselves.
              <Content component="p">
                Admins need a grant too: ask another administrator to grant you access.
              </Content>
            ) : (
              <Content component="p">
                Admins need a grant too:{' '}
                <Link to={`/admin/users/${encodeURIComponent(username)}/access`}>
                  grant yourself access from your user page
                </Link>
                .
              </Content>
            )}
          </EmptyStateFooter>
        )}
      </EmptyState>
    </PageSection>
  );
}
