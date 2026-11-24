import { HttpResponse } from 'msw';
import {
  apiVersionOf,
  K8S_MODELS,
  NamespaceModel,
  PROJECT_ANNOTATIONS,
  ProjectModel,
  ProjectRequestModel,
  SelfSubjectAccessReviewModel,
  type APIGroupList,
  type APIVersions,
  type K8sList,
  type K8sModel,
  type K8sResource,
  type Namespace,
  type Project,
  type SelfSubjectAccessReview,
  type Status,
} from '@/shared/k8s';
import type { MockCredential } from '../fixtures';
import { servesProjects } from './fixtures';
import { settlePvcResize } from './networkingStorageFixtures';
import { credentialAllows, forbiddenMessage, rbacResource, subjectOf } from './rbac';
import { openApiResponse } from './openapi';
import { parseFieldSelector, parseLabelSelector, type ObjectPredicate } from './selectors';
import { notFound, statusResponse, unknownResource } from './status';
import {
  compactedResourceVersion,
  currentResourceVersion,
  getObject,
  listObjects,
  removeObject,
  upsertObject,
} from './store';
import { applyJsonPatch, invalidStatus, SUBRESOURCES } from './subresources';
import { MAX_WATCH_SECONDS, watchResponse } from './watch';

/**
 * The mock Kubernetes API server behind the mock proxy (T-0070): discovery, list (paging, selectors), get, watch,
 * create, update (PUT with optimistic concurrency), JSON Patch (T-0174), delete, subresources (`subresources.ts`) and
 * SelfSubjectAccessReview and OpenAPI v3 (`openapi.ts`), with RBAC from the grant's credential. Error bodies are Kubernetes `Status` objects, as the proxy passes them through (contract §4).
 */

/** A request that passed the proxy's checks. */
export interface ApiServerRequest {
  cluster: string;
  credential: MockCredential;
  request: Request;
  /** The upstream path, e.g. `/api/v1/namespaces/shop/pods`. */
  path: string;
  query: URLSearchParams;
}

/** A parsed resource URL. */
interface ResourceTarget {
  model: K8sModel;
  namespace: string | undefined;
  name: string | undefined;
  /** E.g. `scale`; only with a `name`. */
  subresource: string | undefined;
}

const AUTHORIZATION_GROUP = 'authorization.k8s.io';

/** API groups only OpenShift serves; vanilla clusters (`servesProjects` false) lack them in discovery and URLs. */
const OPENSHIFT_GROUPS: ReadonlySet<string> = new Set([
  'project.openshift.io',
  'apps.openshift.io',
  'route.openshift.io',
  'config.openshift.io',
  'machine.openshift.io',
  'operators.coreos.com',
]);

function servedModels(cluster: string): K8sModel[] {
  return K8S_MODELS.filter((model) => !OPENSHIFT_GROUPS.has(model.group) || servesProjects(cluster));
}

function versionInfo(): Response {
  return HttpResponse.json({
    major: '1',
    minor: '30',
    gitVersion: 'v1.30.4',
    platform: 'linux/amd64',
  });
}

function coreVersions(): Response {
  const body: APIVersions & { kind: 'APIVersions' } = {
    kind: 'APIVersions',
    versions: ['v1'],
    serverAddressByClientCIDRs: [{ clientCIDR: '0.0.0.0/0', serverAddress: '10.0.0.1:6443' }],
  };
  return HttpResponse.json(body);
}

function groupList(cluster: string): Response {
  // Group → its version (one per group here, e.g. `autoscaling` → `v2`).
  const groups = new Map(
    servedModels(cluster)
      .filter((model) => model.group !== '')
      .map((model) => [model.group, model.version]),
  );
  const body: APIGroupList & { kind: 'APIGroupList'; apiVersion: 'v1' } = {
    kind: 'APIGroupList',
    apiVersion: 'v1',
    groups: [...groups].map(([name, versionName]) => {
      const version = { groupVersion: `${name}/${versionName}`, version: versionName };
      return { name, versions: [version], preferredVersion: version };
    }),
  };
  return HttpResponse.json(body);
}

function resourceList(cluster: string, group: string, version: string): Response {
  const models = servedModels(cluster).filter((model) => model.group === group && model.version === version);
  if (models.length === 0) return unknownResource();
  return HttpResponse.json({
    kind: 'APIResourceList',
    apiVersion: 'v1',
    groupVersion: group === '' ? version : `${group}/${version}`,
    resources: models.map((model) => ({
      name: model.plural,
      singularName: model.kind.toLowerCase(),
      namespaced: model.namespaced,
      kind: model.kind,
      verbs:
        model === SelfSubjectAccessReviewModel
          ? ['create']
          : ['create', 'delete', 'deletecollection', 'get', 'list', 'patch', 'update', 'watch'],
    })),
  });
}

/** Maps the HTTP method (and whether a name / `watch` is given) to the RBAC verb. */
function verbOf(method: string, hasName: boolean, watch: boolean): string | undefined {
  switch (method) {
    case 'GET':
      return hasName ? 'get' : watch ? 'watch' : 'list';
    case 'POST':
      return hasName ? undefined : 'create';
    case 'PUT':
      return hasName ? 'update' : undefined;
    case 'PATCH':
      return hasName ? 'patch' : undefined;
    case 'DELETE':
      return hasName ? 'delete' : 'deletecollection';
    default:
      return undefined;
  }
}

function methodNotAllowed(): Response {
  return statusResponse(
    405,
    'MethodNotAllowed',
    'the server does not allow this method on the requested resource',
  );
}

function badRequest(message: string): Response {
  return statusResponse(400, 'BadRequest', message);
}

/** Strips the type meta from list items, as the API server does (only single objects and watch events carry it). */
function listItem(object: K8sResource): Omit<K8sResource, 'apiVersion' | 'kind'> {
  return Object.fromEntries(
    Object.entries(object).filter(([key]) => key !== 'apiVersion' && key !== 'kind'),
  ) as Omit<K8sResource, 'apiVersion' | 'kind'>;
}

interface ContinueToken {
  rv: number;
  /** `<namespace>/<name>` of the last item returned. */
  after: string;
}

function encodeContinue(token: ContinueToken): string {
  return btoa(JSON.stringify(token));
}

function decodeContinue(value: string): ContinueToken | undefined {
  try {
    const parsed: unknown = JSON.parse(atob(value));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'rv' in parsed &&
      typeof parsed.rv === 'number' &&
      'after' in parsed &&
      typeof parsed.after === 'string'
    ) {
      return { rv: parsed.rv, after: parsed.after };
    }
  } catch {
    // Falls through to "invalid".
  }
  return undefined;
}

function itemKey(object: K8sResource): string {
  return `${object.metadata.namespace ?? ''}/${object.metadata.name ?? ''}`;
}

function list(api: ApiServerRequest, target: ResourceTarget, matches: ObjectPredicate): Response {
  const limit = Number.parseInt(api.query.get('limit') ?? '0', 10);
  const continueParam = api.query.get('continue');
  let rv = currentResourceVersion(api.cluster);
  let after = '';
  if (continueParam) {
    const token = decodeContinue(continueParam);
    if (!token) return badRequest('continue key is not valid: incorrect encoded start resourceVersion');
    if (token.rv < compactedResourceVersion(api.cluster)) {
      return statusResponse(
        410,
        'Expired',
        'The provided continue parameter is too old to display a consistent list result. ' +
          'You can start a new list without the continue parameter.',
      );
    }
    rv = token.rv;
    after = token.after;
  }

  const all = listObjects(api.cluster, target.model, target.namespace).filter(
    (object) => matches(object) && (after === '' || itemKey(object) > after),
  );
  const page = limit > 0 ? all.slice(0, limit) : all;
  const remaining = all.length - page.length;
  const last = page.at(-1);
  const body: K8sList<Omit<K8sResource, 'apiVersion' | 'kind'>> = {
    kind: `${target.model.kind}List`,
    apiVersion: apiVersionOf(target.model),
    metadata: {
      resourceVersion: String(rv),
      ...(remaining > 0 && last
        ? { continue: encodeContinue({ rv, after: itemKey(last) }), remainingItemCount: remaining }
        : {}),
    },
    items: page.map(listItem),
  };
  return HttpResponse.json(body);
}

/** Parses the request body as a JSON object; `undefined` when it is not one. */
async function readObject(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Field errors of `object` for `model` (the few the console can trigger), as `[field, message]` pairs. */
function validationErrors(
  model: K8sModel,
  object: K8sResource,
  urlName: string | undefined,
): [string, string][] {
  const errors: [string, string][] = [];
  const name = object.metadata.name;
  if (!name) errors.push(['metadata.name', 'Required value: name or generateName is required']);
  else if (urlName !== undefined && name !== urlName) {
    errors.push(['metadata.name', `Invalid value: "${name}": field is immutable`]);
  }
  for (const field of ['labels', 'annotations'] as const) {
    const map: unknown = object.metadata[field];
    if (map === undefined || map === null) continue;
    if (typeof map !== 'object' || Array.isArray(map)) {
      errors.push([`metadata.${field}`, 'Invalid value: must be an object']);
      continue;
    }
    for (const [key, value] of Object.entries(map)) {
      if (typeof value !== 'string')
        errors.push([`metadata.${field}[${key}]`, 'Invalid value: must be a string']);
    }
  }
  const data = (object as { data?: unknown }).data;
  if (model.kind === 'ConfigMap' && data !== undefined && data !== null) {
    if (typeof data !== 'object') errors.push(['data', 'Invalid value: must be an object']);
    else {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value !== 'string') errors.push([`data[${key}]`, 'Invalid value: must be a string']);
      }
    }
  }
  return errors;
}

function invalid(model: K8sModel, name: string, errors: [string, string][]): Response {
  return invalidStatus({ name, group: model.group, kind: model.kind }, errors);
}

/** Turns a request body into an object of `target.model` (type meta filled in), or an error response. */
async function readResource(
  request: Request,
  target: ResourceTarget,
): Promise<{ object: K8sResource } | { error: Response }> {
  const body = await readObject(request);
  if (!body || typeof body.metadata !== 'object' || body.metadata === null) {
    return { error: badRequest('the request body is not a valid Kubernetes object') };
  }
  const apiVersion = apiVersionOf(target.model);
  if (
    (body.kind !== undefined && body.kind !== target.model.kind) ||
    (body.apiVersion ?? apiVersion) !== apiVersion
  ) {
    return {
      error: badRequest(
        `the API version or kind in the body does not match ${apiVersion} ${target.model.kind}`,
      ),
    };
  }
  const object = { ...body, apiVersion, kind: target.model.kind } as K8sResource;
  if (target.model.namespaced) object.metadata = { ...object.metadata, namespace: target.namespace };
  return { object };
}

async function create(api: ApiServerRequest, target: ResourceTarget): Promise<Response> {
  const read = await readResource(api.request, target);
  if ('error' in read) return read.error;
  const name = read.object.metadata.name ?? '';
  const errors = validationErrors(target.model, read.object, undefined);
  if (errors.length > 0) return invalid(target.model, name, errors);
  if (getObject(api.cluster, target.model, target.namespace, name)) {
    return statusResponse(409, 'AlreadyExists', `${target.model.plural} "${name}" already exists`, {
      name,
      group: target.model.group,
      kind: target.model.plural,
    });
  }
  // The server assigns identity and version; client-sent values are ignored.
  const metadata = {
    ...read.object.metadata,
    uid: undefined,
    resourceVersion: undefined,
    creationTimestamp: undefined,
  };
  return HttpResponse.json(upsertObject(api.cluster, { ...read.object, metadata }), { status: 201 });
}

async function update(api: ApiServerRequest, target: ResourceTarget, name: string): Promise<Response> {
  const read = await readResource(api.request, target);
  if ('error' in read) return read.error;
  const errors = validationErrors(target.model, read.object, name);
  if (errors.length > 0) return invalid(target.model, name, errors);
  const stored = getObject(api.cluster, target.model, target.namespace, name);
  if (!stored) return notFound(target.model.plural, name, target.model.group);
  const expected = read.object.metadata.resourceVersion;
  // No resourceVersion in the body = unconditional update, like the real API server.
  if (expected !== undefined && expected !== stored.metadata.resourceVersion) {
    return conflict(target.model, name);
  }
  return HttpResponse.json(upsertObject(api.cluster, read.object));
}

function conflict(model: K8sModel, name: string): Response {
  return statusResponse(
    409,
    'Conflict',
    `Operation cannot be fulfilled on ${model.plural}${model.group ? `.${model.group}` : ''} ` +
      `"${name}": the object has been modified; please apply your changes to the latest version and try again`,
    { name, group: model.group, kind: model.plural },
  );
}

/**
 * `PATCH` with a JSON Patch (ADR-0037 §4): applies the ops to the stored object, validates the result like a PUT
 * (type meta and name are immutable; a patched `resourceVersion` makes it conditional), then stores it — new
 * `resourceVersion`, watch MODIFIED — and answers the stored object.
 */
async function patch(api: ApiServerRequest, target: ResourceTarget, name: string): Promise<Response> {
  const { model } = target;
  const stored = getObject(api.cluster, model, target.namespace, name);
  if (!stored) return notFound(model.plural, name, model.group);
  const result = await applyJsonPatch(api.request, stored, { name, group: model.group, kind: model.kind });
  if ('error' in result) return result.error;
  const patched = result.patched;
  // A patch may remove or retype `metadata`; the static type no longer holds then.
  const metadata: unknown = patched.metadata;
  if (typeof metadata !== 'object' || metadata === null) {
    return invalid(model, name, [['metadata', 'Required value']]);
  }
  const errors = validationErrors(model, patched, name);
  if (patched.apiVersion !== stored.apiVersion || patched.kind !== stored.kind) {
    errors.push(['kind', 'Invalid value: apiVersion and kind are immutable']);
  }
  if (errors.length > 0) return invalid(model, name, errors);
  if (patched.metadata.resourceVersion !== stored.metadata.resourceVersion) return conflict(model, name);
  return HttpResponse.json(upsertObject(api.cluster, settlePvcResize(patched)));
}

/**
 * `POST projectrequests` (OpenShift self-provisioning, T-0309): creates the Namespace and its Project — display name,
 * description and the requesting user as annotations — and answers the Project (201). The name is taken → 409.
 */
async function projectRequest(api: ApiServerRequest): Promise<Response> {
  const body = (await readObject(api.request)) as
    | { metadata?: { name?: unknown }; displayName?: unknown; description?: unknown }
    | undefined;
  const name = typeof body?.metadata?.name === 'string' ? body.metadata.name : '';
  if (!name) {
    return invalid(ProjectRequestModel, name, [['metadata.name', 'Required value: name is required']]);
  }
  if (getObject(api.cluster, NamespaceModel, undefined, name)) {
    return statusResponse(409, 'AlreadyExists', `project.project.openshift.io "${name}" already exists`, {
      name,
      group: ProjectModel.group,
      kind: ProjectModel.plural,
    });
  }
  const annotations: Record<string, string> = { [PROJECT_ANNOTATIONS.requester]: subjectOf(api.credential) };
  if (typeof body?.displayName === 'string' && body.displayName) {
    annotations[PROJECT_ANNOTATIONS.displayName] = body.displayName;
  }
  if (typeof body?.description === 'string' && body.description) {
    annotations[PROJECT_ANNOTATIONS.description] = body.description;
  }
  const namespace: Namespace = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name, labels: { 'kubernetes.io/metadata.name': name }, annotations },
    spec: { finalizers: ['kubernetes'] },
    status: { phase: 'Active' },
  };
  const stored = upsertObject(api.cluster, namespace as K8sResource);
  // A project is a view of its namespace: same name, uid and annotations.
  const project: Project = {
    apiVersion: 'project.openshift.io/v1',
    kind: 'Project',
    metadata: { ...stored.metadata, resourceVersion: undefined },
    spec: { finalizers: ['kubernetes'] },
    status: { phase: 'Active' },
  };
  return HttpResponse.json(upsertObject(api.cluster, project), { status: 201 });
}

function remove(api: ApiServerRequest, target: ResourceTarget, name: string): Response {
  const removed = removeObject(api.cluster, target.model, target.namespace, name);
  if (!removed) return notFound(target.model.plural, name, target.model.group);
  const status: Status = {
    kind: 'Status',
    apiVersion: 'v1',
    metadata: {},
    status: 'Success',
    details: { name, group: target.model.group, kind: target.model.plural, uid: removed.metadata.uid },
  };
  return HttpResponse.json(status);
}

/** `POST selfsubjectaccessreviews`: answers from the credential's RBAC profile. */
async function accessReview(api: ApiServerRequest): Promise<Response> {
  // A client may omit `spec` entirely: that is a 400 like a missing `resourceAttributes`, not a crash (500).
  const body = (await readObject(api.request)) as Partial<SelfSubjectAccessReview> | undefined;
  const spec = body?.spec;
  const attributes = spec?.resourceAttributes;
  if (!spec || !attributes) return badRequest('spec.resourceAttributes is required');
  const verb = attributes.verb ?? '';
  const resource = attributes.resource ?? '';
  const allowed = credentialAllows(api.credential, verb, resource);
  const review: SelfSubjectAccessReview = {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectAccessReview',
    metadata: {},
    spec,
    status: allowed
      ? { allowed: true, reason: 'RBAC: allowed by ClusterRoleBinding' }
      : { allowed: false, denied: false, reason: '' },
  };
  return HttpResponse.json(review, { status: 201 });
}

/** Parses a resource URL below `/api/v1` or `/apis/<group>/<version>`. */
function parseTarget(
  cluster: string,
  group: string,
  version: string,
  rest: string[],
): ResourceTarget | 'unknown' {
  const namespaced = rest[0] === 'namespaces' && rest.length >= 3;
  const [namespace, plural, name, ...subresource] = namespaced ? rest.slice(1) : [undefined, ...rest];
  const model = servedModels(cluster).find(
    (candidate) => candidate.group === group && candidate.version === version && candidate.plural === plural,
  );
  if (!model || subresource.length > 1 || (namespace !== undefined && !model.namespaced)) return 'unknown';
  return { model, namespace, name, subresource: subresource[0] };
}

/** Serves one request against the mock cluster `api.cluster`. */
export async function apiServer(api: ApiServerRequest): Promise<Response> {
  const segments = api.path.split('/').filter((segment) => segment !== '');
  const method = api.request.method.toUpperCase();

  if (segments.length === 1 && method === 'GET') {
    if (segments[0] === 'version') return versionInfo();
    if (segments[0] === 'api') return coreVersions();
    if (segments[0] === 'apis') return groupList(api.cluster);
  }
  if (segments[0] === 'openapi' && segments[1] === 'v3' && method === 'GET') {
    return openApiResponse(api.credential, api.path, segments.slice(2));
  }

  let group: string;
  let version: string;
  let rest: string[];
  if (segments[0] === 'api' && segments.length >= 2) {
    [group, version, rest] = ['', segments[1] ?? '', segments.slice(2)];
  } else if (segments[0] === 'apis' && segments.length >= 3) {
    [group, version, rest] = [segments[1] ?? '', segments[2] ?? '', segments.slice(3)];
  } else {
    return unknownResource();
  }

  if (rest.length === 0)
    return method === 'GET' ? resourceList(api.cluster, group, version) : methodNotAllowed();
  if (group === AUTHORIZATION_GROUP && version === 'v1' && rest.length === 1 && method === 'POST') {
    if (rest[0] === SelfSubjectAccessReviewModel.plural) return accessReview(api);
    if (rest[0] === 'selfsubjectrulesreviews') {
      return HttpResponse.json(
        {
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SelfSubjectRulesReview',
          spec: {},
          status: { resourceRules: [], nonResourceRules: [], incomplete: true },
        },
        { status: 201 },
      );
    }
  }

  const target = parseTarget(api.cluster, group, version, rest);
  if (target === 'unknown' || target.model === SelfSubjectAccessReviewModel) return unknownResource();

  const watch = ['1', 'true'].includes(api.query.get('watch') ?? '');
  // POST to an object's subresource (DeploymentConfig `instantiate`, `rollback`) is a `create` of that subresource.
  const verb =
    method === 'POST' && target.subresource !== undefined && target.name !== undefined
      ? 'create'
      : verbOf(method, target.name !== undefined, watch);
  if (!verb) return methodNotAllowed();
  const { model, namespace, name, subresource } = target;
  const handler = subresource === undefined ? undefined : SUBRESOURCES[subresource];
  if (subresource !== undefined && !handler?.appliesTo(model)) return unknownResource();
  const resource = rbacResource(model.plural, subresource);
  if (!credentialAllows(api.credential, verb, resource)) {
    return statusResponse(
      403,
      'Forbidden',
      forbiddenMessage(api.credential, verb, resource, model.group, namespace, name),
      {
        ...(name === undefined ? {} : { name }),
        group: model.group,
        kind: model.plural,
      },
    );
  }

  if (handler && name !== undefined) {
    return handler.serve({
      cluster: api.cluster,
      request: api.request,
      query: api.query,
      model,
      namespace,
      name,
      verb,
    });
  }

  switch (verb) {
    case 'get': {
      const object = getObject(api.cluster, model, namespace, name ?? '');
      return object ? HttpResponse.json(object) : notFound(model.plural, name ?? '', model.group);
    }
    case 'list':
    case 'watch': {
      const labels = parseLabelSelector(api.query.get('labelSelector'));
      const fields = parseFieldSelector(api.query.get('fieldSelector'));
      if (!labels) return badRequest('unable to parse requirement: invalid label selector');
      if (!fields) return badRequest('invalid field selector');
      const matches: ObjectPredicate = (object) => labels(object) && fields(object);
      if (verb === 'list') return list(api, target, matches);
      const timeout = Number.parseInt(api.query.get('timeoutSeconds') ?? '', 10);
      return watchResponse({
        cluster: api.cluster,
        model,
        namespace,
        matches,
        resourceVersion: api.query.get('resourceVersion'),
        timeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? timeout : MAX_WATCH_SECONDS,
        signal: api.request.signal,
      });
    }
    case 'create':
      return model === ProjectRequestModel ? projectRequest(api) : create(api, target);
    case 'update':
      return update(api, target, name ?? '');
    case 'patch':
      return patch(api, target, name ?? '');
    case 'delete':
      return remove(api, target, name ?? '');
    default:
      // deletecollection is not used by the console.
      return methodNotAllowed();
  }
}
