import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { ApiError } from '@/shared/api';
import { k8sGetPath } from './client';
import type { K8sModel } from './models';
import { k8sQueryKeys } from './queryKeys';
import { proxyBasePath } from './url';

/**
 * The active cluster's OpenAPI v3 schema (ADR-0038): the index, then only the document of the model's group-version,
 * cached per cluster in TanStack Query. Derived data (kind lookup, per-kind JSON Schema) is memoised per document
 * object, never cached. Every failure degrades to "no schema" silently (OAPI-2).
 */

/** One schema node of an OpenAPI v3 document, used unchanged as JSON Schema (ADR-0038 §7). */
export interface JSONSchema {
  $ref?: string;
  type?: string | readonly string[];
  format?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: readonly string[];
  items?: JSONSchema;
  additionalProperties?: JSONSchema | boolean;
  allOf?: readonly JSONSchema[];
  enum?: readonly unknown[];
  'x-kubernetes-group-version-kind'?: readonly GroupVersionKind[];
  components?: { schemas?: Record<string, JSONSchema> };
  [extension: string]: unknown;
}

/** An `x-kubernetes-group-version-kind` entry (`group` is `''` for the core group). */
export interface GroupVersionKind {
  group: string;
  version: string;
  kind: string;
}

/** `GET /openapi/v3`: one entry per group-version; `serverRelativeURL` carries `?hash=`, so its content is immutable. */
export interface OpenApiIndex {
  paths: Record<string, { serverRelativeURL: string }>;
}

/** One group-version document (`GET /openapi/v3/apis/apps/v1?hash=…`); only `components.schemas` is used. */
export interface OpenApiDocument {
  components?: { schemas?: Record<string, JSONSchema> };
}

/** A kind's schema: the document it lives in, its root schema name and the self-contained JSON Schema for Monaco. */
export interface OpenApiSchema {
  doc: OpenApiDocument;
  /** Schema name in `components.schemas`, e.g. `io.k8s.api.apps.v1.Deployment`. */
  rootName: string;
  /** `{ $ref: '#/components/schemas/<root>', components: { schemas } }` with only the root's `$ref` closure. */
  jsonSchema: JSONSchema;
}

/** Summary of one child property of a {@link SchemaField}, enough to list it (OCP "View sidebar"). */
export interface SchemaRef {
  /** OCP-style type text: `string`, `object`, `[]Container`, `map[string]string`. */
  type: string;
  description?: string;
  enum?: readonly unknown[];
  /** Whether the property has properties of its own (directly, or through array items / map values). */
  drillable: boolean;
}

/** A resolved schema path: the field itself plus its children (an array's or map's children are its values'). */
export interface SchemaField {
  name: string;
  type: string;
  description?: string;
  required: readonly string[];
  properties?: Record<string, SchemaRef>;
}

const SCHEMA_REF_PREFIX = '#/components/schemas/';
const DOCUMENT_GC_MS = 30 * 60 * 1000;
/** Guards `$ref` chains against cycles; real chains are 1–2 deep. */
const MAX_REF_HOPS = 16;

/** Clusters whose schema failure was already logged this session (OAPI-2: one `console.debug` per cluster). */
const loggedClusters = new Set<string>();

/** The index key of a model's group-version: `api/v1` for the core group, else `apis/<group>/<version>`. */
export function gvPath(model: K8sModel): string {
  return model.group === '' ? `api/${model.version}` : `apis/${model.group}/${model.version}`;
}

function refName(ref: string | undefined): string | undefined {
  return ref?.startsWith(SCHEMA_REF_PREFIX) ? ref.slice(SCHEMA_REF_PREFIX.length) : undefined;
}

/** Short type name of a schema name: `io.k8s.api.core.v1.Container` → `Container`. */
function shortName(name: string): string {
  return name.slice(name.lastIndexOf('.') + 1);
}

/** Follows `$ref` and single-element `allOf` wrappers to the schema that describes the value. */
function deref(doc: OpenApiDocument, schema: JSONSchema): JSONSchema | undefined {
  const schemas = doc.components?.schemas ?? {};
  let current: JSONSchema | undefined = schema;
  for (let hop = 0; current && hop < MAX_REF_HOPS; hop++) {
    const wrapped: JSONSchema | undefined = current.allOf?.length === 1 ? current.allOf[0] : undefined;
    if (wrapped) {
      current = wrapped;
      continue;
    }
    const name = refName(current.$ref);
    if (name === undefined) return current;
    current = schemas[name];
  }
  return undefined;
}

/** The schema name a property points at, through an `allOf` wrapper. */
function targetName(schema: JSONSchema): string | undefined {
  return refName(schema.$ref) ?? (schema.allOf?.length === 1 ? refName(schema.allOf[0]?.$ref) : undefined);
}

/** The map value schema of a free-form object (`additionalProperties` without `properties`). */
function mapValue(schema: JSONSchema): JSONSchema | undefined {
  return typeof schema.additionalProperties === 'object' && !schema.properties ? schema.additionalProperties : undefined;
}

/**
 * Type text as OCP's `explore-type-sidebar.tsx` shows it, made precise for arrays and maps: a primitive's type, the
 * `format`/`type` of a referenced primitive, `object` for a referenced object, `[]Item` for arrays, `map[string]V`.
 */
function typeText(doc: OpenApiDocument, schema: JSONSchema): string {
  const resolved = deref(doc, schema);
  if (!resolved) return 'object';
  const target = targetName(schema);
  if (resolved.items) {
    const itemName = targetName(resolved.items);
    return `[]${itemName ? shortName(itemName) : typeText(doc, resolved.items)}`;
  }
  const value = mapValue(resolved);
  if (value) return `map[string]${typeText(doc, value)}`;
  const type = typeof resolved.type === 'string' ? resolved.type : resolved.type?.join(' ');
  if (target !== undefined) return resolved.format ?? type ?? 'object';
  return type ?? 'object';
}

/** The schema whose `properties` are a field's children: the value itself, an array's items or a map's values. */
function childContainer(doc: OpenApiDocument, schema: JSONSchema): JSONSchema | undefined {
  const resolved = deref(doc, schema);
  if (!resolved) return undefined;
  if (resolved.items) return deref(doc, resolved.items);
  const value = mapValue(resolved);
  return value ? deref(doc, value) : resolved;
}

function summarize(doc: OpenApiDocument, schema: JSONSchema): SchemaRef {
  const resolved = deref(doc, schema);
  const description = schema.description ?? resolved?.description;
  const values = schema.enum ?? resolved?.enum;
  return {
    type: typeText(doc, schema),
    ...(description === undefined ? {} : { description }),
    ...(values === undefined ? {} : { enum: values }),
    drillable: Object.keys(childContainer(doc, schema)?.properties ?? {}).length > 0,
  };
}

/**
 * Resolves `path` (property names below the kind's root, e.g. `['spec', 'containers', 'resources', 'limits']`) to its
 * field. Follows `$ref`, single-element `allOf`, array `items` and map `additionalProperties`: an array or map field's
 * children are its values' properties, so no `items` segment is needed. `undefined` for an unknown path. The empty
 * path is the root.
 */
export function resolveSchemaPath(
  doc: OpenApiDocument,
  rootName: string,
  path: readonly string[],
): SchemaField | undefined {
  const root = doc.components?.schemas?.[rootName];
  if (!root) return undefined;
  let field: JSONSchema = root;
  for (const segment of path) {
    const next = childContainer(doc, field)?.properties?.[segment];
    if (!next) return undefined;
    field = next;
  }
  const children = childContainer(doc, field);
  const description = field.description ?? deref(doc, field)?.description;
  const properties = children?.properties;
  return {
    name: path.at(-1) ?? shortName(rootName),
    type: path.length === 0 ? 'object' : typeText(doc, field),
    ...(description === undefined ? {} : { description }),
    required: children?.required ?? [],
    ...(properties
      ? {
          properties: Object.fromEntries(
            Object.entries(properties).map(([name, schema]) => [name, summarize(doc, schema)]),
          ),
        }
      : {}),
  };
}

/** Every `$ref` target reachable from `rootName` (inclusive): the schemas Monaco needs for one kind (ADR-0038 §7). */
function refClosure(schemas: Record<string, JSONSchema>, rootName: string): Record<string, JSONSchema> {
  const closure: Record<string, JSONSchema> = {};
  const pending = [rootName];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') {
          const name = refName(value);
          if (name !== undefined && !(name in closure)) pending.push(name);
        } else {
          visit(value);
        }
      }
    }
  };
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const schema = schemas[name];
    if (name in closure || !schema) continue;
    closure[name] = schema;
    visit(schema);
  }
  return closure;
}

function kindKey(gvk: GroupVersionKind): string {
  return `${gvk.group}/${gvk.version}/${gvk.kind}`;
}

/** Per document: kind key → its schema (or `null` when the document has no such kind). */
const schemaCache = new WeakMap<OpenApiDocument, Map<string, OpenApiSchema | null>>();
/** Per document: kind key → root schema name, built in one pass over the document. */
const rootIndexCache = new WeakMap<OpenApiDocument, Map<string, string>>();

/** Kind lookup by `x-kubernetes-group-version-kind` (ADR-0038 §3), so CRDs and OpenShift kinds work alike. */
function rootNameOf(doc: OpenApiDocument, gvk: GroupVersionKind): string | undefined {
  let roots = rootIndexCache.get(doc);
  if (!roots) {
    roots = new Map();
    for (const [name, schema] of Object.entries(doc.components?.schemas ?? {})) {
      for (const entry of schema['x-kubernetes-group-version-kind'] ?? []) roots.set(kindKey(entry), name);
    }
    rootIndexCache.set(doc, roots);
  }
  return roots.get(kindKey(gvk));
}

/** The schema of `model`'s kind in `doc`, memoised per document; `undefined` if the document lacks the kind. */
export function openApiSchemaFor(doc: OpenApiDocument, model: K8sModel): OpenApiSchema | undefined {
  const gvk = { group: model.group, version: model.version, kind: model.kind };
  let perKind = schemaCache.get(doc);
  if (!perKind) {
    perKind = new Map();
    schemaCache.set(doc, perKind);
  }
  const key = kindKey(gvk);
  const cached = perKind.get(key);
  if (cached !== undefined) return cached ?? undefined;
  const rootName = rootNameOf(doc, gvk);
  const schema =
    rootName === undefined
      ? null
      : {
          doc,
          rootName,
          jsonSchema: {
            $ref: `${SCHEMA_REF_PREFIX}${rootName}`,
            components: { schemas: refClosure(doc.components?.schemas ?? {}, rootName) },
          },
        };
  perKind.set(key, schema);
  return schema ?? undefined;
}

/** 403 (SA may not read `/openapi`) and 404 (not served) won't change on retry (ADR-0038 §4). */
function retryTransient(failureCount: number, error: Error): boolean {
  return !(error instanceof ApiError && (error.status === 403 || error.status === 404)) && failureCount < 3;
}

/** Whether a parsed body is an object (a malformed body must not reach the `WeakMap`s). */
function isDocument(value: unknown): value is OpenApiDocument {
  return typeof value === 'object' && value !== null;
}

/**
 * The OpenAPI schema of `model`'s kind on `cluster` (OAPI-1): reads the index once per cluster, then only the
 * model's group-version document. Returns `undefined` while loading **and** on any failure (403, 404, network,
 * malformed, kind absent) — consumers treat both alike; the failure is logged once per cluster (`console.debug`),
 * never shown (OAPI-2).
 */
export function useOpenApiSchema(cluster: string, model: K8sModel): OpenApiSchema | undefined {
  const path = gvPath(model);
  const index = useQuery({
    queryKey: k8sQueryKeys.openapiIndex(cluster),
    queryFn: ({ signal }) => k8sGetPath<OpenApiIndex>(`${proxyBasePath(cluster)}/openapi/v3`, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: retryTransient,
  });
  // The body is untrusted JSON: a malformed index simply has no entry for `path`. A URL outside
  // `/openapi/v3/` (or with `..`) is ignored so a hostile cluster can't steer the GET elsewhere.
  const rawUrl = (index.data as Partial<OpenApiIndex> | undefined)?.paths?.[path]?.serverRelativeURL;
  const url =
    typeof rawUrl === 'string' && rawUrl.startsWith('/openapi/v3/') && !rawUrl.includes('..') ? rawUrl : undefined;
  const document = useQuery({
    queryKey: k8sQueryKeys.openapiDocument(cluster, path),
    queryFn: ({ signal }) => k8sGetPath<OpenApiDocument>(`${proxyBasePath(cluster)}${url ?? ''}`, signal),
    enabled: url !== undefined,
    staleTime: Infinity,
    gcTime: DOCUMENT_GC_MS,
    retry: retryTransient,
  });
  const schema = useMemo(
    () => (isDocument(document.data) ? openApiSchemaFor(document.data, model) : undefined),
    [document.data, model],
  );

  // A primitive, so the effect only re-runs when the reason changes.
  const failure =
    index.error?.message ??
    document.error?.message ??
    (index.isSuccess && url === undefined ? `${path} is not in the index` : undefined) ??
    (document.isSuccess && !schema ? `${model.kind} is not in ${path}` : undefined);
  useEffect(() => {
    if (failure === undefined || loggedClusters.has(cluster)) return;
    loggedClusters.add(cluster);
    console.debug(`OpenAPI schema unavailable on ${cluster}: ${failure}`);
  }, [cluster, failure]);

  return schema;
}
