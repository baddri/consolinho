import { applyPatch, JsonPatchError, type Operation } from 'fast-json-patch';
import { HttpResponse } from 'msw';
import type { K8sModel, K8sResource } from '@/shared/k8s';
import { notFound, statusResponse } from './status';
import { getObject, upsertObject } from './store';

/**
 * Subresources of the mock API server (T-0174, ADR-0037 §8) and the JSON Patch engine every mock PATCH uses. Each
 * entry of {@link SUBRESOURCES} serves `…/<plural>/<name>/<subresource>`; T-0178 adds `log`. Exec is not an entry: it is a
 * WebSocket (`ws.link`, T-0180) that never reaches the API server and must check `create pods/exec` itself. The proxy's
 * guards and the credential's RBAC already ran when a handler is called.
 */

/** A request for a subresource of one object, after RBAC. */
export interface SubresourceRequest {
  cluster: string;
  request: Request;
  query: URLSearchParams;
  model: K8sModel;
  namespace: string | undefined;
  name: string;
  /** The RBAC verb of the request (`get`, `patch`, `create`, …). */
  verb: string;
}

/** One subresource: which kinds have it and how a request for it is answered. */
export interface SubresourceHandler {
  /** Whether `model` has this subresource; other kinds answer 404 like an unknown resource. */
  appliesTo: (model: K8sModel) => boolean;
  serve: (request: SubresourceRequest) => Response | Promise<Response>;
}

/** `Content-Type` of an RFC 6902 patch, the only patch type the console sends (ADR-0037 §4). */
export const JSON_PATCH_CONTENT_TYPE = 'application/json-patch+json';

/** Errors in the patch document itself (400); every other patch error is about the object (422). */
const MALFORMED_PATCH = new Set<string>([
  'SEQUENCE_NOT_AN_ARRAY',
  'OPERATION_NOT_AN_OBJECT',
  'OPERATION_OP_INVALID',
  'OPERATION_PATH_INVALID',
  'OPERATION_FROM_REQUIRED',
  'OPERATION_VALUE_REQUIRED',
  'OPERATION_VALUE_CANNOT_CONTAIN_UNDEFINED',
]);

/** Identifies the object in a 422 `Status.details`. */
export interface InvalidDetails {
  name: string;
  group: string;
  kind: string;
}

/** A 422 `Invalid` Status worded like the API server's, with one cause per `[field, message]`. */
export function invalidStatus(details: InvalidDetails, errors: [string, string][]): Response {
  return statusResponse(
    422,
    'Invalid',
    `${details.kind} "${details.name}" is invalid: ${errors.map(([field, message]) => (field ? `${field}: ${message}` : message)).join(', ')}`,
    {
      ...details,
      causes: errors.map(([field, message]) => ({ reason: 'FieldValueInvalid', field, message })),
    },
  );
}

/**
 * Reads a JSON Patch request body and applies it to a copy of `document`, as the API server does: another content
 * type is 415, a body that is not a valid patch 400 `BadRequest`, an op that cannot apply (missing path, failed
 * `test`) 422 `Invalid`. `document` itself is never mutated.
 */
export async function applyJsonPatch<T extends object>(
  request: Request,
  document: T,
  details: InvalidDetails,
): Promise<{ patched: T } | { error: Response }> {
  const contentType = request.headers.get('Content-Type')?.split(';')[0]?.trim();
  if (contentType !== JSON_PATCH_CONTENT_TYPE) {
    return {
      error: statusResponse(
        415,
        'UnsupportedMediaType',
        `the body of the request was in an unknown format - accepted media types include: ${JSON_PATCH_CONTENT_TYPE}`,
      ),
    };
  }
  let ops: unknown;
  try {
    ops = await request.json();
  } catch {
    return { error: statusResponse(400, 'BadRequest', 'the patch is not valid JSON') };
  }
  try {
    // validateOperation = true checks the shape of every op before any is applied; the clone keeps `document` intact.
    return { patched: applyPatch(structuredClone(document), ops as Operation[], true).newDocument };
  } catch (error) {
    if (!(error instanceof JsonPatchError)) throw error;
    // The library appends the op and tree to its message; the first line is the reason.
    const reason = error.message.split('\n')[0] ?? error.name;
    if (MALFORMED_PATCH.has(error.name)) {
      return { error: statusResponse(400, 'BadRequest', `invalid JSON Patch: ${reason}`) };
    }
    return { error: invalidStatus(details, [['', reason]]) };
  }
}

/** `autoscaling/v1 Scale`: the view of a workload's replica count that `…/scale` reads and patches. */
interface Scale {
  apiVersion: 'autoscaling/v1';
  kind: 'Scale';
  metadata: K8sResource['metadata'];
  spec: { replicas: number };
  status: { replicas: number; selector?: string };
}

/** The replica-count fields of a scalable workload. */
interface Scalable extends K8sResource {
  spec?: { replicas?: number; selector?: { matchLabels?: Record<string, string> } };
  status?: { replicas?: number };
}

/** `<group>/<plural>` of the kinds with a `scale` subresource. */
const SCALABLE = new Set(['apps/deployments', 'apps/replicasets', 'apps/statefulsets']);

function scaleOf(object: Scalable): Scale {
  const { name, namespace, uid, resourceVersion, creationTimestamp } = object.metadata;
  const labels = Object.entries(object.spec?.selector?.matchLabels ?? {});
  return {
    apiVersion: 'autoscaling/v1',
    kind: 'Scale',
    metadata: { name, namespace, uid, resourceVersion, creationTimestamp },
    spec: { replicas: object.spec?.replicas ?? 1 },
    status: {
      replicas: object.status?.replicas ?? 0,
      ...(labels.length > 0 ? { selector: labels.map(([key, value]) => `${key}=${value}`).join(',') } : {}),
    },
  };
}

/**
 * `GET`/`PATCH …/scale`: maps the workload's `spec.replicas` to and from an `autoscaling/v1 Scale`. A patch stores
 * the workload (new `resourceVersion`, watch MODIFIED) and answers the new Scale.
 */
const scale: SubresourceHandler = {
  appliesTo: (model) => SCALABLE.has(`${model.group}/${model.plural}`),
  async serve({ cluster, request, model, namespace, name, verb }) {
    const stored: Scalable | undefined = getObject(cluster, model, namespace, name);
    if (!stored) return notFound(model.plural, name, model.group);
    if (verb === 'get') return HttpResponse.json(scaleOf(stored));
    if (verb !== 'patch') {
      return statusResponse(
        405,
        'MethodNotAllowed',
        'the server does not allow this method on the requested resource',
      );
    }
    const details = { name, group: 'autoscaling', kind: 'Scale' };
    const result = await applyJsonPatch(request, scaleOf(stored), details);
    if ('error' in result) return result.error;
    const replicas: unknown = result.patched.spec.replicas;
    if (typeof replicas !== 'number' || !Number.isInteger(replicas) || replicas < 0) {
      return invalidStatus(details, [
        ['spec.replicas', 'Invalid value: must be an integer greater than or equal to 0'],
      ]);
    }
    const next: Scalable = { ...stored, spec: { ...stored.spec, replicas } };
    const updated: Scalable = upsertObject(cluster, next);
    return HttpResponse.json(scaleOf(updated));
  },
};

/** Subresources the mock serves, by URL segment. */
export const SUBRESOURCES: Record<string, SubresourceHandler> = { scale };
