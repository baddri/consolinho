import { useMemo } from 'react';
import type { ApiError } from '@/shared/api';
import {
  NamespaceModel,
  PROJECT_ANNOTATIONS,
  ProjectModel,
  useK8sDiscovery,
  useK8sList,
  type K8sResource,
} from '@/shared/k8s';

/** One entry of the project selector. */
export interface ProjectOption {
  name: string;
  /** OpenShift display name, when set and different from the name. */
  displayName: string | undefined;
}

/** Result of {@link useProjectOptions}. */
export interface ProjectOptions {
  /** Projects (or namespaces), sorted by name; `undefined` while loading or after an error without data. */
  options: ProjectOption[] | undefined;
  /** "Project" on OpenShift, "Namespace" where `project.openshift.io` isn't served. */
  noun: 'Project' | 'Namespace';
  error: ApiError | null;
}

function toOption(obj: K8sResource): ProjectOption {
  const name = obj.metadata.name ?? '';
  const displayName = obj.metadata.annotations?.[PROJECT_ANNOTATIONS.displayName];
  return { name, displayName: displayName && displayName !== name ? displayName : undefined };
}

/**
 * What the project selector offers on `cluster` (NS-1): the live list of projects the cluster's service account can
 * see, or of namespaces on vanilla Kubernetes. Waits for discovery so it lists the right kind only once. Fetched and
 * watched only while `enabled` (the menu is open); cached data stays available in between.
 */
export function useProjectOptions(cluster: string, enabled: boolean): ProjectOptions {
  const discovery = useK8sDiscovery(cluster);
  const servesProjects = discovery.isServed(ProjectModel);
  const list = useK8sList<K8sResource>(cluster, servesProjects ? ProjectModel : NamespaceModel, {
    enabled: enabled && !discovery.isPending,
  });
  const options = useMemo(
    () => list.data?.map(toOption).sort((a, b) => a.name.localeCompare(b.name)),
    [list.data],
  );
  // "Project" while discovery is pending: the console's default wording, avoids a "Namespace" flash on OpenShift.
  const noun = servesProjects || discovery.isPending ? 'Project' : 'Namespace';
  return { options, noun, error: list.error };
}
