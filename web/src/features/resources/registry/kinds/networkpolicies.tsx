import { NetworkPolicyModel, type K8sResource, type NetworkPolicy } from '@/shared/k8s';
import {
  NetworkPolicyDetails,
  NetworkPolicySections,
} from '../../networking/networkpolicies/NetworkPolicyDetails';
import { PolicyPodSelector } from '../../networking/networkpolicies/PolicySelectors';
import { labelSelectorString, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed NetworkPolicy (`metadata` always present). */
export type NetworkPolicyResource = NetworkPolicy & K8sResource;

/**
 * NetworkPolicies (NP-1/NP-2, networking-console-plugin `NetworkPolicyList` / `useNetworkPolicyColumn`): Name,
 * Namespace and Pod selector (≥ md, "All pods within <ns>" for the empty selector), as OCP (no Created column).
 * Details: the target pods and policy types right, then Ingress rules and Egress rules tables
 * (`NetworkPolicyDetailsIngress` / `…Egress`).
 */
export const networkPolicyDescriptor: ResourceDescriptor<NetworkPolicyResource> = {
  model: NetworkPolicyModel,
  nav: { section: 'networking', order: 40 },
  // OCP has no Events tab on this kind (T-0310 F1).
  hasEventsTab: false,
  DetailsSection: NetworkPolicyDetails,
  ExtraSections: NetworkPolicySections,
  columns: [
    nameColumn(NetworkPolicyModel),
    namespaceColumn(NetworkPolicyModel),
    {
      id: 'pod-selector',
      title: 'Pod selector',
      visibility: ['hidden', 'visibleOnMd'],
      cell: (np) => <PolicyPodSelector namespace={np.metadata.namespace} selector={np.spec?.podSelector} />,
      sortValue: (np) => labelSelectorString(np.spec?.podSelector),
    },
  ],
};
