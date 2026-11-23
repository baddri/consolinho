// The mock Kubernetes proxy + API servers (T-0070).
import { mockPodLogs } from './podLogs';
import { mockK8s as mockK8sStore } from './store';

export { k8sProxyHandler, proxyMutationListeners } from './handlers';
export { proxyAuditInput, type ProxyMutation, type ProxyDenialReason } from './proxyAudit';
export { resetK8sStore, type StoreChange } from './store';
export { startK8sSimulator } from './simulator';
export { servesProjects, VANILLA_CLUSTERS, WEB_POD_NAMES, FIXTURE_NAMESPACES } from './fixtures';

/** Test helpers of the mock clusters: the store's (`store.ts`) plus the container logs' (`podLogs.ts`, T-0178). */
export const mockK8s = { ...mockK8sStore, ...mockPodLogs };
