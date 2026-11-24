import { NetworkPolicyModel, type K8sResource, type NetworkPolicy } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed NetworkPolicy (`metadata` always present). */
export type NetworkPolicyResource = NetworkPolicy & K8sResource;

/**
 * NetworkPolicies (OCP networking-console-plugin `NetworkPoliciesList`). Minimal descriptor from the CP5a foundation (T-0300): Name, Namespace, Created; columns,
 * details and actions are filled in by T-0305.
 */
export const networkPolicyDescriptor: ResourceDescriptor<NetworkPolicyResource> = {
  model: NetworkPolicyModel,
  nav: { section: 'networking', order: 40 },
  columns: [nameColumn(NetworkPolicyModel), namespaceColumn(NetworkPolicyModel), ageColumn()],
};
