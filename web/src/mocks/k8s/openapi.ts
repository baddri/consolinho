import { HttpResponse } from 'msw';
import type { OpenApiDocument, OpenApiIndex } from '@/shared/k8s';
import type { MockCredential } from '../fixtures';
import { appsV1Document } from './fixtures/openapi/apps';
import { coreV1Document } from './fixtures/openapi/core';
import { profileOf, subjectOf } from './rbac';
import { statusResponse, unknownResource } from './status';

/**
 * The mock API server's OpenAPI v3 endpoints (T-0210, ADR-0038): `GET /openapi/v3` (index) and
 * `GET /openapi/v3/<gvPath>?hash=…` from trimmed fixtures (`api/v1`, `apis/apps/v1`). Like an SA without the
 * `system:discovery` binding, `view`-profile credentials (e.g. alice's prod-eu-1 grant) get 403, so the silent degrade
 * (OAPI-2) is reachable in the mock UI.
 */

/** Served documents by group-version path, with the content hash the index advertises. */
const DOCUMENTS: Record<string, { hash: string; document: OpenApiDocument }> = {
  'api/v1': { hash: '6C1A4E1B2F6D9A0C3E7B5D8F1A2C4E6B', document: coreV1Document },
  'apis/apps/v1': { hash: '9F3E2D1C0B4A59687F6E5D4C3B2A1908', document: appsV1Document },
};

/** Serves `/openapi/v3[/<gvPath>]` (`segments` without the leading `openapi`, `v3`) for `credential`. */
export function openApiResponse(credential: MockCredential, path: string, segments: readonly string[]): Response {
  if (profileOf(credential) === 'view') {
    return statusResponse(
      403,
      'Forbidden',
      `forbidden: User "${subjectOf(credential)}" cannot get path "${path}"`,
    );
  }
  if (segments.length === 0) {
    const index: OpenApiIndex = {
      paths: Object.fromEntries(
        Object.entries(DOCUMENTS).map(([gvPath, { hash }]) => [
          gvPath,
          { serverRelativeURL: `/openapi/v3/${gvPath}?hash=${hash}` },
        ]),
      ),
    };
    return HttpResponse.json(index);
  }
  const served = DOCUMENTS[segments.join('/')];
  return served ? HttpResponse.json(served.document) : unknownResource();
}
