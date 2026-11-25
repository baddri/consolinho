// The discovery documents recorded on a kind cluster (T-0377), re-exported for colocated tests, which may only import
// from `src/test/` (eslint boundaries). Typed as the Kubernetes discovery shapes the app reads.
import type { APIGroupList, APIVersions } from '@/shared/k8s';
import api from '@/mocks/k8s/fixtures/kind/api.json';
import apis from '@/mocks/k8s/fixtures/kind/apis.json';

/** `GET /api` of a vanilla kind cluster. */
export const kindApiVersions: APIVersions = api as APIVersions;

/** `GET /apis` of a vanilla kind cluster. */
export const kindApiGroups: APIGroupList = apis as APIGroupList;
