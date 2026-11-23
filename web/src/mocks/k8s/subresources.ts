import { applyPatch, JsonPatchError, type Operation } from 'fast-json-patch';
import { HttpResponse } from 'msw';
import {
  ReplicationControllerModel,
  type DeploymentConfig,
  type K8sModel,
  type K8sResource,
  type ReplicationController,
} from '@/shared/k8s';
import { podLog } from './podLogs';
import { notFound, statusResponse } from './status';
import { getObject, listObjects, upsertObject } from './store';

/**
 * Subresources of the mock API server (T-0174, ADR-0037 §8) and the JSON Patch engine every mock PATCH uses. Each
 * entry of {@link SUBRESOURCES} serves `…/<plural>/<name>/<subresource>`; `log` is in `podLogs.ts` (T-0178). Exec is not an entry: it is a
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
  /** A `LabelSelector` (apps kinds) or a plain label map (ReplicationController, DeploymentConfig). */
  spec?: { replicas?: number; selector?: { matchLabels?: Record<string, string> } | Record<string, string> };
  status?: { replicas?: number };
}

/** `<group>/<plural>` of the kinds with a `scale` subresource (Jobs have none: parallelism is a plain PATCH). */
const SCALABLE = new Set([
  'apps/deployments',
  'apps/replicasets',
  'apps/statefulsets',
  '/replicationcontrollers',
  'apps.openshift.io/deploymentconfigs',
]);

/** The equality labels of a workload's selector, whichever of the two shapes it has. */
function selectorLabels(selector: NonNullable<Scalable['spec']>['selector']): [string, string][] {
  if (!selector) return [];
  const { matchLabels } = selector;
  if (typeof matchLabels === 'object') return Object.entries(matchLabels);
  return Object.entries(selector).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
}

function scaleOf(object: Scalable): Scale {
  const { name, namespace, uid, resourceVersion, creationTimestamp } = object.metadata;
  const labels = selectorLabels(object.spec?.selector);
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

/** Whether `model` is OpenShift's DeploymentConfig, the only kind with `instantiate` and `rollback`. */
function isDeploymentConfig(model: K8sModel): boolean {
  return model.group === 'apps.openshift.io' && model.plural === 'deploymentconfigs';
}

/** 405 for a verb a POST-only subresource does not serve. */
function postOnly(): Response {
  return statusResponse(405, 'MethodNotAllowed', 'the server does not allow this method on the requested resource');
}

/** Label (and annotation) the deployer stamps on a DeploymentConfig's RCs. */
const DC_NAME_LABEL = 'openshift.io/deployment-config.name';

/** The ReplicationControllers a DeploymentConfig created (one per rollout), by the deployer's name label. */
function controllersOf(cluster: string, dc: DeploymentConfig): ReplicationController[] {
  return listObjects(cluster, ReplicationControllerModel, dc.metadata.namespace).filter(
    (rc) => rc.metadata.labels?.[DC_NAME_LABEL] === dc.metadata.name,
  ) as ReplicationController[];
}

/**
 * `POST deploymentconfigs/<name>/instantiate` (a `DeploymentRequest`, OCP "Start rollout"): bumps
 * `status.latestVersion`, adds RC `<name>-<version>` running the DC's template and scales the older RCs to 0 — the
 * end state of a completed rollout. Answers 201 with the updated DeploymentConfig.
 */
const instantiate: SubresourceHandler = {
  appliesTo: isDeploymentConfig,
  serve({ cluster, model, namespace, name, verb }) {
    if (verb !== 'create') return postOnly();
    const dc = getObject(cluster, model, namespace, name) as DeploymentConfig | undefined;
    if (!dc) return notFound(model.plural, name, model.group);
    const version = (dc.status?.latestVersion ?? 0) + 1;
    const replicas = dc.spec?.replicas ?? 1;
    for (const old of controllersOf(cluster, dc)) {
      upsertObject(cluster, { ...old, spec: { ...old.spec, replicas: 0 }, status: { replicas: 0 } } as K8sResource);
    }
    const rcName = `${name}-${String(version)}`;
    const labels = { ...dc.spec?.selector, deployment: rcName };
    const template = structuredClone(dc.spec?.template ?? {});
    template.metadata = { ...template.metadata, labels: { ...template.metadata?.labels, deployment: rcName } };
    const controller: ReplicationController = {
      apiVersion: 'v1',
      kind: 'ReplicationController',
      metadata: {
        name: rcName,
        namespace,
        labels: { ...dc.metadata.labels, [DC_NAME_LABEL]: name },
        annotations: {
          [DC_NAME_LABEL]: name,
          'openshift.io/deployment-config.latest-version': String(version),
          'openshift.io/deployment.phase': 'Complete',
        },
        ownerReferences: [
          {
            apiVersion: 'apps.openshift.io/v1',
            kind: 'DeploymentConfig',
            name,
            uid: dc.metadata.uid ?? '',
            controller: true,
            blockOwnerDeletion: true,
          },
        ],
      },
      spec: { replicas, selector: labels, template },
      status: { replicas, readyReplicas: replicas, availableReplicas: replicas },
    };
    upsertObject(cluster, controller as K8sResource);
    const updated = upsertObject(cluster, {
      ...dc,
      status: { ...dc.status, latestVersion: version, details: { message: 'manual change' } },
    } as K8sResource);
    return HttpResponse.json(updated, { status: 201 });
  },
};

/** The body of `POST …/rollback`, as far as the mock reads it. */
interface DeploymentConfigRollback {
  kind?: string;
  spec?: { from?: { name?: string }; revision?: number; includeReplicationMeta?: boolean };
}

/**
 * `POST deploymentconfigs/<name>/rollback` (a `DeploymentConfigRollback`): answers 200 with the DeploymentConfig as it
 * would be rolled back — the RC's pod template without the deployer's `deployment` label (plus its replicas with
 * `includeReplicationMeta`) — without storing it; the client then PUTs the answer (OCP `rollback-modal.tsx`). The RC
 * is found by `spec.revision`, else by `spec.from.name`.
 */
const rollback: SubresourceHandler = {
  appliesTo: isDeploymentConfig,
  async serve({ cluster, request, model, namespace, name, verb }) {
    if (verb !== 'create') return postOnly();
    const dc = getObject(cluster, model, namespace, name) as DeploymentConfig | undefined;
    if (!dc) return notFound(model.plural, name, model.group);
    let body: DeploymentConfigRollback;
    try {
      body = (await request.json()) as DeploymentConfigRollback;
    } catch {
      return statusResponse(400, 'BadRequest', 'the rollback request is not valid JSON');
    }
    if (body.kind !== 'DeploymentConfigRollback') {
      return statusResponse(400, 'BadRequest', `expected kind DeploymentConfigRollback, got ${String(body.kind)}`);
    }
    const rcName =
      body.spec?.revision ? `${name}-${String(body.spec.revision)}` : body.spec?.from?.name;
    const rc =
      rcName === undefined
        ? undefined
        : (getObject(cluster, ReplicationControllerModel, namespace, rcName) as ReplicationController | undefined);
    if (!rc) {
      return invalidStatus({ name, group: model.group, kind: 'DeploymentConfigRollback' }, [
        ['spec.revision', `couldn't find deployment for rollback`],
      ]);
    }
    const template = structuredClone(rc.spec?.template ?? {});
    if (template.metadata?.labels) delete template.metadata.labels.deployment;
    const rolledBack: DeploymentConfig = {
      ...dc,
      spec: {
        ...dc.spec,
        template,
        ...(body.spec?.includeReplicationMeta ? { replicas: rc.spec?.replicas ?? 1 } : {}),
      },
    };
    return HttpResponse.json(rolledBack);
  },
};

/** Subresources the mock serves, by URL segment. */
export const SUBRESOURCES: Record<string, SubresourceHandler> = { scale, log: podLog, instantiate, rollback };
