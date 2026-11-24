// Public API of the Kubernetes data layer (ADR-0022 §1). Every Kubernetes call and type goes through this module.
export * from './models';
export type * from './types';
export { PROJECT_ANNOTATIONS } from './types';
export { resourceApiPath, proxyBasePath, type ResourceApiPathOptions } from './url';
export {
  k8sListAll,
  k8sGet,
  k8sUpdate,
  k8sPatch,
  k8sDelete,
  k8sCreate,
  k8sCreateSubresource,
  LIST_PAGE_SIZE,
  type ListOptions,
  type K8sListData,
  type JsonPatchOp,
  type PatchTarget,
} from './client';
export { k8sErrorFromResponse } from './errors';
export { labelSelectorString, type LabelSelector, type LabelSelectorRequirement } from './labelSelector';
export { k8sQueryKeys, type AccessReview, type AccessVerb } from './queryKeys';
export { useK8sList, useK8sGet, type K8sLiveResult } from './hooks';
export { useK8sDiscovery } from './discovery';
export {
  useOpenApiSchema,
  openApiSchemaFor,
  resolveSchemaPath,
  gvPath,
  type OpenApiSchema,
  type OpenApiDocument,
  type OpenApiIndex,
  type JSONSchema,
  type GroupVersionKind,
  type SchemaField,
  type SchemaRef,
} from './openapi';
export { useCanI } from './access';
export { WATCH_FLUSH_MS, setWatchTimingForTests, type LiveStatus } from './watchManager';
export {
  streamPodLog,
  podLogPath,
  parseLogLine,
  logTimeKey,
  logTimeToSecond,
  type LogLine,
  type PodLogOptions,
} from './logStream';
export {
  execUrl,
  encodeStdin,
  encodeResize,
  decodeFrame,
  execFailureMessage,
  EXEC_SUBPROTOCOL,
  EXEC_SHELL_COMMAND,
  type ExecFrame,
  type ExecOptions,
} from './exec';
