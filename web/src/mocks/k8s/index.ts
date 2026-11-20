// The mock Kubernetes proxy + API servers (T-0070).
export { k8sProxyHandler, proxyMutationListeners } from './handlers';
export { proxyAuditInput, type ProxyMutation, type ProxyDenialReason } from './proxyAudit';
export { mockK8s, resetK8sStore, type StoreChange } from './store';
export { startK8sSimulator } from './simulator';
export { servesProjects, VANILLA_CLUSTERS, WEB_POD_NAMES, FIXTURE_NAMESPACES } from './fixtures';
