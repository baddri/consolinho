import { PROJECT_ANNOTATIONS, ProjectModel, type Project } from '@/shared/k8s';
import { ageColumn, nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';
import { NamespaceDetails } from './NamespaceDetails';
import { namespaceLikeColumns, phaseStatus } from './namespaces';

function requester(project: Project): string | undefined {
  return project.metadata.annotations?.[PROJECT_ANNOTATIONS.requester];
}

/**
 * Projects (UI-3, Home, first): Name, Display name, Status, Requester, Created; delete asks for the name. OpenShift
 * only — discovery hides the nav item where `project.openshift.io` isn't served.
 */
export const projectDescriptor: ResourceDescriptor<Project> = {
  model: ProjectModel,
  nav: { section: 'home', order: 10 },
  status: phaseStatus,
  DetailsSection: NamespaceDetails,
  deleteRequiresName: true,
  columns: [
    nameColumn(ProjectModel),
    ...namespaceLikeColumns<Project>(),
    {
      id: 'requester',
      title: 'Requester',
      cell: (project) => requester(project) ?? '—',
      sortValue: (project) => requester(project) ?? null,
    },
    ageColumn(),
  ],
};
