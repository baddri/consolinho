import { HttpResponse } from 'msw';
import type { Status } from '@/shared/k8s';

/**
 * A Kubernetes `Status` object as the API server builds it for failures (and successful deletes). These bodies pass
 * through the proxy unchanged (contract §4), so the client must tell them apart from FleetConsole ProblemDetails.
 */
export function k8sStatus(
  code: number,
  reason: string,
  message: string,
  details?: Status['details'],
): Status {
  return {
    kind: 'Status',
    apiVersion: 'v1',
    metadata: {},
    status: code < 400 ? 'Success' : 'Failure',
    message,
    reason,
    ...(details === undefined ? {} : { details }),
    code,
  };
}

/** {@link k8sStatus} as an `application/json` response with the matching HTTP status. */
export function statusResponse(
  code: number,
  reason: string,
  message: string,
  details?: Status['details'],
): HttpResponse<Status> {
  return HttpResponse.json(k8sStatus(code, reason, message, details), { status: code });
}

/** 404 for a missing object: `configmaps "web" not found`. */
export function notFound(plural: string, name: string, group: string): HttpResponse<Status> {
  return statusResponse(404, 'NotFound', `${plural}${group ? `.${group}` : ''} "${name}" not found`, {
    name,
    ...(group ? { group } : {}),
    kind: plural,
  });
}

/** 404 for a URL that names no served resource. */
export function unknownResource(): HttpResponse<Status> {
  return statusResponse(404, 'NotFound', 'the server could not find the requested resource');
}
