import { PageSection, Skeleton, Stack, StackItem } from '@patternfly/react-core';
import { DeploymentModel, useK8sGet } from '@/shared/k8s';
import { ResourceErrorState } from '../../../components/ResourceErrorState';
import { useResourceRoute } from '../../../resourceRoute';
import { DeploymentForm } from './DeploymentForm';
import type { DeploymentObject } from './deploymentFormValues';

/**
 * Edit Deployment page at `…/deployments/<name>/form` (FORM-1, OCP `DeploymentPage` → `EditDeployment`; no project
 * bar, like OCP): the watched Deployment's {@link DeploymentForm}. Loading and errors look like the details page (skeleton,
 * `ResourceErrorState`; `error` is checked before `data`). The form is keyed by the object so another Deployment (or
 * cluster) starts a fresh edit; new versions of the same one only mark the edit stale.
 */
export function EditDeploymentPage() {
  const { cluster, namespace = '', name = '' } = useResourceRoute();
  const result = useK8sGet<DeploymentObject>(cluster, DeploymentModel, namespace, name);

  let body;
  if (result.error) {
    body = (
      <PageSection>
        <ResourceErrorState
          error={result.error}
          cluster={cluster}
          model={DeploymentModel}
          namespace={namespace}
          name={name}
          verb="get"
          onRetry={() => result.refetch()}
        />
      </PageSection>
    );
  } else if (!result.data) {
    body = (
      <PageSection>
        <Stack hasGutter>
          <StackItem>
            <Skeleton width="40%" screenreaderText={`Loading Deployment ${name}`} />
          </StackItem>
          <StackItem>
            <Skeleton height="200px" />
          </StackItem>
        </Stack>
      </PageSection>
    );
  } else {
    body = <DeploymentForm key={`${cluster}/${namespace}/${name}`} cluster={cluster} live={result.data} />;
  }

  return body;
}
