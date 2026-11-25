import { useQueryClient } from '@tanstack/react-query';
import {
  k8sCreate,
  k8sQueryKeys,
  ProjectModel,
  ProjectRequestModel,
  type Project,
  type ProjectRequest,
} from '@/shared/k8s';
import { useResourceMutation } from '../actions/useResourceMutation';
import type { CreateProjectValues } from './createProjectSchema';

/** What {@link useCreateProject} sends; `namespace` is always `undefined` (projects are cluster-scoped). */
export interface CreateProjectVars extends Omit<CreateProjectValues, 'name'> {
  namespace: undefined;
  name: string;
}

/** The ProjectRequest body: blank display name / description are left out, as OCP does. */
function projectRequest({ name, displayName, description }: CreateProjectVars): ProjectRequest {
  return {
    apiVersion: 'project.openshift.io/v1',
    kind: 'ProjectRequest',
    metadata: { name },
    ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
    ...(description.trim() ? { description } : {}),
  };
}

/**
 * Creates a project on `cluster` the OpenShift way (PRJ-2, OCP `CreateProjectModal`): POST a `ProjectRequest`, whose
 * answer is the new Project. On success the Projects list is invalidated (it also updates through its watch) and the
 * toast names project and cluster; failures (409 AlreadyExists, 403) stay inline in the modal.
 */
export function useCreateProject(cluster: string) {
  const queryClient = useQueryClient();
  return useResourceMutation(cluster, {
    model: ProjectModel,
    mutationFn: async (vars: CreateProjectVars) => {
      // The server answers a ProjectRequest POST with the created Project, not the request.
      const project = (await k8sCreate<ProjectRequest | Project>(
        cluster,
        ProjectRequestModel,
        undefined,
        projectRequest(vars),
      )) as Project;
      void queryClient.invalidateQueries({ queryKey: k8sQueryKeys.list(cluster, ProjectModel) });
      return project;
    },
    successMessage: ({ name }) => `Project ${name} created`,
  });
}
