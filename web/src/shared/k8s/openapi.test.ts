import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { setMockUser } from '@/test/handlers';
import { server } from '@/test/server';
import { ConfigMapModel, DeploymentModel, PodModel } from './models';
import {
  gvPath,
  openApiSchemaFor,
  resolveSchemaPath,
  useOpenApiSchema,
  type JSONSchema,
  type OpenApiDocument,
} from './openapi';

/** Tests of the cluster OpenAPI v3 data layer (T-0210, ADR-0038). */

const S = '#/components/schemas/';
const ref = (name: string): JSONSchema => ({ $ref: `${S}${name}` });

/** A small core/v1-like document in the upstream v3 shape. */
function coreDocument(): OpenApiDocument {
  return {
    components: {
      schemas: {
        'io.k8s.api.core.v1.Pod': {
          description: 'Pod is a collection of containers.',
          type: 'object',
          properties: {
            metadata: { allOf: [ref('io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta')], description: 'Metadata.' },
            spec: { allOf: [ref('io.k8s.api.core.v1.PodSpec')], description: 'Pod spec.' },
          },
          'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: 'Pod' }],
        },
        'io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta': {
          type: 'object',
          properties: {
            labels: { type: 'object', additionalProperties: { type: 'string' }, description: 'Labels.' },
          },
        },
        'io.k8s.api.core.v1.PodSpec': {
          type: 'object',
          required: ['containers'],
          properties: {
            containers: { type: 'array', items: { allOf: [ref('io.k8s.api.core.v1.Container')] }, description: 'C.' },
            args: { type: 'array', items: { type: 'string' } },
          },
        },
        'io.k8s.api.core.v1.Container': {
          description: 'A single application container.',
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', description: 'Name of the container.' },
            resources: ref('io.k8s.api.core.v1.ResourceRequirements'),
            pullPolicy: { type: 'string', enum: ['Always', 'Never'] },
          },
        },
        'io.k8s.api.core.v1.ResourceRequirements': {
          description: 'ResourceRequirements describes the compute resource requirements.',
          type: 'object',
          properties: {
            limits: {
              type: 'object',
              description: 'Limits describes the maximum amount of compute resources allowed.',
              additionalProperties: ref('io.k8s.apimachinery.pkg.api.resource.Quantity'),
            },
          },
        },
        'io.k8s.apimachinery.pkg.api.resource.Quantity': { type: 'string', description: 'Quantity.' },
        'io.k8s.api.core.v1.ConfigMap': {
          type: 'object',
          properties: { metadata: { allOf: [ref('io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta')] } },
          'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: 'ConfigMap' }],
        },
        'io.k8s.api.core.v1.Unrelated': { type: 'object', properties: { x: { type: 'string' } } },
      },
    },
  };
}

const POD = 'io.k8s.api.core.v1.Pod';

describe('gvPath', () => {
  it('maps the core group to api/<version> and others to apis/<group>/<version>', () => {
    expect(gvPath(PodModel)).toBe('api/v1');
    expect(gvPath(DeploymentModel)).toBe('apis/apps/v1');
  });
});

describe('resolveSchemaPath', () => {
  const doc = coreDocument();

  it('resolves the root with its properties and follows $ref / allOf', () => {
    const root = resolveSchemaPath(doc, POD, []);
    expect(root).toMatchObject({ name: 'Pod', type: 'object', description: 'Pod is a collection of containers.' });
    expect(root?.properties?.spec).toEqual({ type: 'object', description: 'Pod spec.', drillable: true });

    // allOf wrapper: the property's own description wins; children come from the referenced schema.
    const spec = resolveSchemaPath(doc, POD, ['spec']);
    expect(spec).toMatchObject({ name: 'spec', type: 'object', description: 'Pod spec.', required: ['containers'] });
    // Plain $ref (no allOf): description falls back to the target's.
    expect(resolveSchemaPath(doc, POD, ['spec', 'containers', 'resources'])).toMatchObject({
      type: 'object',
      description: 'ResourceRequirements describes the compute resource requirements.',
    });
  });

  it("treats an array's children as its items' properties, with the items' required list", () => {
    const containers = resolveSchemaPath(doc, POD, ['spec', 'containers']);
    expect(containers).toMatchObject({ type: '[]Container', required: ['name'] });
    expect(Object.keys(containers?.properties ?? {})).toEqual(['name', 'resources', 'pullPolicy']);
    expect(containers?.properties?.pullPolicy).toEqual({ type: 'string', enum: ['Always', 'Never'], drillable: false });
    expect(resolveSchemaPath(doc, POD, ['spec', 'args'])).toMatchObject({ type: '[]string', required: [] });
  });

  it('names maps map[string]<value> and resolves into additionalProperties', () => {
    expect(resolveSchemaPath(doc, POD, ['metadata', 'labels'])).toMatchObject({
      type: 'map[string]string',
      description: 'Labels.',
    });
    const limits = resolveSchemaPath(doc, POD, ['spec', 'containers', 'resources', 'limits']);
    expect(limits).toEqual({
      name: 'limits',
      type: 'map[string]string',
      description: 'Limits describes the maximum amount of compute resources allowed.',
      required: [],
    });
  });

  it('returns undefined for an unknown path or root', () => {
    expect(resolveSchemaPath(doc, POD, ['spec', 'nope'])).toBeUndefined();
    expect(resolveSchemaPath(doc, POD, ['spec', 'containers', 'name', 'deeper'])).toBeUndefined();
    expect(resolveSchemaPath(doc, 'io.k8s.Missing', [])).toBeUndefined();
  });
});

describe('openApiSchemaFor', () => {
  it('finds the kind by x-kubernetes-group-version-kind and builds the $ref closure only', () => {
    const doc = coreDocument();
    const schema = openApiSchemaFor(doc, PodModel);
    expect(schema?.rootName).toBe(POD);
    expect(schema?.jsonSchema.$ref).toBe(`${S}${POD}`);
    expect(Object.keys(schema?.jsonSchema.components?.schemas ?? {}).sort()).toEqual([
      'io.k8s.api.core.v1.Container',
      'io.k8s.api.core.v1.Pod',
      'io.k8s.api.core.v1.PodSpec',
      'io.k8s.api.core.v1.ResourceRequirements',
      'io.k8s.apimachinery.pkg.api.resource.Quantity',
      'io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta',
    ]);
    // Memoised per document; an absent kind is undefined.
    expect(openApiSchemaFor(doc, PodModel)).toBe(schema);
    expect(openApiSchemaFor(doc, DeploymentModel)).toBeUndefined();
    expect(openApiSchemaFor(doc, ConfigMapModel)?.rootName).toBe('io.k8s.api.core.v1.ConfigMap');
  });

  it('parses a >= 2 MB core/v1-sized document, finds the kind and resolves a nested path in < 100 ms (OAPI-4)', () => {
    const doc = coreDocument();
    const schemas = doc.components?.schemas ?? {};
    const filler = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor. '.repeat(4);
    for (let i = 0; i < 2_500; i++) {
      schemas[`io.k8s.api.core.v1.Synthetic${String(i)}`] = {
        description: filler,
        type: 'object',
        required: ['a'],
        properties: {
          a: { type: 'string', description: filler },
          b: { type: 'array', items: { allOf: [ref(`io.k8s.api.core.v1.Synthetic${String((i + 1) % 2_500)}`)] } },
          c: { type: 'object', additionalProperties: { type: 'string' } },
        },
        'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: `Synthetic${String(i)}` }],
      };
    }
    const body = JSON.stringify(doc);
    expect(body.length).toBeGreaterThanOrEqual(2 * 1024 * 1024);

    const started = performance.now();
    const parsed = JSON.parse(body) as OpenApiDocument;
    const schema = openApiSchemaFor(parsed, PodModel);
    const limits = schema && resolveSchemaPath(parsed, schema.rootName, ['spec', 'containers', 'resources', 'limits']);
    const elapsed = performance.now() - started;

    expect(limits?.type).toBe('map[string]string');
    expect(elapsed).toBeLessThan(100);
  });
});

describe('useOpenApiSchema', () => {
  const PROXY_OPENAPI = '*/api/clusters/:cluster/k8s/openapi/*';

  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return createElement(QueryClientProvider, { client }, children);
  }

  /** Counts OpenAPI GETs per `cluster path` (the stateful mock still answers them). */
  function recordOpenApi(): string[] {
    const requests: string[] = [];
    server.use(
      http.get(PROXY_OPENAPI, ({ request, params }) => {
        const url = new URL(request.url);
        requests.push(`${String(params.cluster)} ${url.pathname.replace(/^.*\/k8s/, '')}`);
        return undefined;
      }),
    );
    return requests;
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('fetches the index and only the model group-version, per cluster, never leaking across clusters (OAPI-1)', async () => {
    // lab-1 serves a different Deployment schema than dev-1.
    server.use(
      http.get('*/api/clusters/lab-1/k8s/openapi/v3/apis/apps/v1', () =>
        HttpResponse.json({
          components: {
            schemas: {
              'io.k8s.api.apps.v1.Deployment': {
                description: 'lab-1 Deployment',
                type: 'object',
                'x-kubernetes-group-version-kind': [{ group: 'apps', version: 'v1', kind: 'Deployment' }],
              },
            },
          },
        }),
      ),
    );
    // Registered last, so it sees every request before the handlers above answer it.
    const requests = recordOpenApi();
    const { result, rerender } = renderHook(({ cluster }) => useOpenApiSchema(cluster, DeploymentModel), {
      wrapper,
      initialProps: { cluster: 'dev-1' },
    });

    await waitFor(() => {
      expect(result.current?.rootName).toBe('io.k8s.api.apps.v1.Deployment');
    });
    const devDescription = result.current?.doc.components?.schemas?.[result.current.rootName]?.description;
    expect(devDescription).toBe('Deployment enables declarative updates for Pods and ReplicaSets.');
    expect(requests).toEqual(['dev-1 /openapi/v3', 'dev-1 /openapi/v3/apis/apps/v1']);

    rerender({ cluster: 'lab-1' });
    // Never the other cluster's schema while lab-1 loads.
    expect(result.current).toBeUndefined();
    await waitFor(() => {
      expect(result.current?.doc.components?.schemas?.['io.k8s.api.apps.v1.Deployment']?.description).toBe(
        'lab-1 Deployment',
      );
    });
    expect(requests).toEqual([
      'dev-1 /openapi/v3',
      'dev-1 /openapi/v3/apis/apps/v1',
      'lab-1 /openapi/v3',
      'lab-1 /openapi/v3/apis/apps/v1',
    ]);
  });

  it.each([
    { status: 403, user: 'alice', cluster: 'prod-eu-1', override: false },
    { status: 404, user: 'alice', cluster: 'staging-eu-1', override: true },
  ])('returns undefined on $status without retry and logs once per cluster (OAPI-2)', async (scenario) => {
    setMockUser(scenario.user);
    if (scenario.override) {
      server.use(
        http.get(`*/api/clusters/${scenario.cluster}/k8s/openapi/v3`, () =>
          HttpResponse.json({ kind: 'Status', code: 404, reason: 'NotFound' }, { status: 404 }),
        ),
      );
    }
    const requests = recordOpenApi();
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    onTestFinished(() => {
      debug.mockRestore();
    });

    const first = renderHook(() => useOpenApiSchema(scenario.cluster, PodModel), { wrapper });
    await waitFor(() => {
      expect(debug).toHaveBeenCalledTimes(1);
    });
    // A second consumer (another kind, fresh cache) does not log again.
    const second = renderHook(() => useOpenApiSchema(scenario.cluster, DeploymentModel), { wrapper });
    await waitFor(() => {
      expect(requests).toHaveLength(2);
    });
    await sleep(50);

    expect(first.result.current).toBeUndefined();
    expect(second.result.current).toBeUndefined();
    expect(requests).toEqual([`${scenario.cluster} /openapi/v3`, `${scenario.cluster} /openapi/v3`]);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(String(debug.mock.calls[0]?.[0])).toContain(scenario.cluster);
  });
});
