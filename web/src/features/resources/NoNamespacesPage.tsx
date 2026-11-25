import { EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter, PageSection } from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';
import { useNavigate } from 'react-router';
import { NamespaceSelector } from '@/features/cluster-context';
import { PRODUCT_NAME } from '@/shared/branding';
import { PodModel } from '@/shared/k8s';
import { resourcePath } from './paths';

/**
 * Cluster landing when the token can't list namespaces and the admin configured none for the user's access (NSF-4):
 * an OCP-style empty state, no error, with the project selector as its action — in fallback mode its menu offers
 * `Go to namespace "<typed>"` (NSF-2), and choosing a namespace opens its Pods list.
 */
export function NoNamespacesPage({ cluster }: { cluster: string }) {
  const navigate = useNavigate();
  return (
    <PageSection>
      <EmptyState titleText="No namespaces available" headingLevel="h1" icon={CubesIcon}>
        <EmptyStateBody>
          Your access to this cluster can&apos;t list namespaces and none are configured for it. Enter a namespace
          name, or ask a {PRODUCT_NAME} administrator to add one.
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <NamespaceSelector
              cluster={cluster}
              namespace={undefined}
              onSelect={(namespace) => {
                if (namespace) void navigate(resourcePath(cluster, PodModel, { namespace }));
              }}
            />
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    </PageSection>
  );
}
