import { DeploymentConfigModel, type DeploymentConfig } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed DeploymentConfig (the hand-written type already carries `metadata`). */
export type DeploymentConfigResource = DeploymentConfig;

/**
 * DeploymentConfigs (WL-1, OCP `deployment-config.tsx`; OpenShift-only, hidden where `apps.openshift.io` is not served): minimal descriptor from the CP4b foundation (T-0189) — Name, Namespace, Created. Columns,
 * details and actions are filled in by T-0193.
 */
export const deploymentConfigDescriptor: ResourceDescriptor<DeploymentConfigResource> = {
  model: DeploymentConfigModel,
  nav: { section: 'workloads', order: 30 },
  extraTabs: ['replicationcontrollers'],
  columns: [nameColumn(DeploymentConfigModel), namespaceColumn(DeploymentConfigModel), ageColumn()],
};
