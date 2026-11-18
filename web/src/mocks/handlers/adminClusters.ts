import type { ClusterEnvironment } from '@/shared/api';
import { actorName, findCluster, mockDb, recordAudit } from '../db';
import type { MockCluster } from '../fixtures';
import { conflictProblem, problem } from '../problem';
import { bindBody, bindVersion, DNS_LABEL, isHttpsUrl, type BodyBinder, type EnumValues } from './body';
import { http } from './http';
import {
  countPemCertificates,
  ordinal,
  toClusterDetail,
  toClusterListItem,
  toGrant,
} from './representations';

const ENVIRONMENTS: EnumValues<ClusterEnvironment> = ['production', 'staging', 'development'];

/** 404 `Clusters.NotFound`. */
export function clusterNotFound(name: string) {
  return problem(404, { code: 'Clusters.NotFound', detail: `Cluster ${name} doesn't exist.` });
}

/** Editable connection/display fields shared by register and update (contract §8.2). */
interface ClusterFields {
  displayName: string | null;
  apiUrl: string;
  environment: ClusterEnvironment;
  webConsoleUrl: string | null;
  description: string | null;
  caBundle: string | null;
  skipTlsVerify: boolean;
}

/** Binds and validates the editable fields (CLU-1/2/3 subset), normalising the API URL (no trailing '/'). */
function bindClusterFields(body: BodyBinder): ClusterFields {
  const displayName = body.optionalString('displayName');
  if (displayName !== null && displayName.length > 100) {
    body.error('displayName', 'Display name must be at most 100 characters.');
  }

  let apiUrl = body.requiredString('apiUrl', 'API URL');
  if (apiUrl.trim() !== '') {
    if (!isHttpsUrl(apiUrl)) {
      body.error('apiUrl', 'Enter an absolute https:// URL.');
    } else {
      const url = new URL(apiUrl);
      if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username) {
        body.error('apiUrl', 'The API URL must not contain a path, query, fragment or user info.');
      }
      apiUrl = apiUrl.replace(/\/+$/, '');
    }
  }

  const webConsoleUrl = body.optionalString('webConsoleUrl');
  if (webConsoleUrl !== null && !isHttpsUrl(webConsoleUrl)) {
    body.error('webConsoleUrl', 'Enter an absolute https:// URL.');
  }
  const description = body.optionalString('description');
  if (description !== null && description.length > 1000) {
    body.error('description', 'Description must be at most 1000 characters.');
  }

  const caBundle = body.optionalString('caBundle');
  if (caBundle !== null && countPemCertificates(caBundle) === 0) {
    body.error('caBundle', 'The CA bundle must contain at least one PEM certificate.');
  }
  const skipTlsVerify = body.boolean('skipTlsVerify', false);
  if (skipTlsVerify && caBundle !== null) {
    body.error('skipTlsVerify', 'Skip TLS verification and a CA bundle are mutually exclusive.');
  }

  const environment = body.enumValue('environment', 'Environment', ENVIRONMENTS);
  return { displayName, apiUrl, environment, webConsoleUrl, description, caBundle, skipTlsVerify };
}

/** Resolves the route's cluster and checks the request's `version`: the cluster, or the 404/409 response to send. */
function loadCluster(name: string, version: number) {
  const cluster = findCluster(name);
  if (!cluster) return { error: clusterNotFound(name) } as const;
  if (version !== cluster.version) return { error: conflictProblem('cluster') } as const;
  return { cluster } as const;
}

/** Audits a change of `cluster` by the signed-in user. */
function auditCluster(
  cluster: MockCluster,
  action: string,
  summary: string,
  details: Record<string, unknown>,
) {
  recordAudit({
    action,
    category: 'clusters',
    targetType: 'cluster',
    targetId: cluster.name,
    targetName: cluster.name,
    clusterName: cluster.name,
    summary,
    details,
  });
}

/** Enables or disables a cluster; transitions to the current state are idempotent 200s (CLU-5). */
function setEnabled(cluster: MockCluster, isEnabled: boolean): void {
  if (cluster.isEnabled === isEnabled) return;
  const actor = actorName();
  cluster.isEnabled = isEnabled;
  cluster.version += 1;
  cluster.updatedAt = new Date().toISOString();
  cluster.updatedBy = actor;
  const verb = isEnabled ? 'enabled' : 'disabled';
  auditCluster(cluster, `cluster.${verb}`, `${actor} ${verb} cluster ${cluster.name}.`, {});
}

/** `/api/admin/clusters` cluster CRUD, enable/disable and the cluster's grants (contract §8.2). */
export const adminClusterHandlers = [
  http.get('/api/admin/clusters', ({ response }) =>
    response(200).json(
      [...mockDb.clusters]
        .sort((a, b) => ordinal(a.name, b.name))
        .map((cluster) => toClusterListItem(cluster)),
    ),
  ),

  http.post('/api/admin/clusters', async ({ request, response }) => {
    const bound = await bindBody(request, (body) => {
      const name = body.requiredString('name', 'Name');
      if (name.trim() !== '' && (name.length > 40 || !DNS_LABEL.test(name))) {
        body.error(
          'name',
          "Use lowercase letters, digits and '-' (max 40), starting and ending with a letter or digit.",
        );
      }
      return { name, fields: bindClusterFields(body), isEnabled: body.boolean('isEnabled', true) };
    });
    if (bound.error) return bound.error;
    const { name, fields, isEnabled } = bound.value;
    if (findCluster(name)) {
      return problem(409, { code: 'Clusters.NameTaken', detail: `Cluster ${name} already exists.` });
    }

    const now = new Date().toISOString();
    const actor = actorName();
    const cluster: MockCluster = {
      ...fields,
      name,
      displayName: fields.displayName ?? name,
      isEnabled,
      connectionSettingsChangedAt: now,
      createdAt: now,
      createdBy: actor,
      updatedAt: null,
      updatedBy: null,
      version: 1,
    };
    mockDb.clusters.push(cluster);
    const detail = toClusterDetail(cluster);
    auditCluster(cluster, 'cluster.registered', `${actor} registered cluster ${name}.`, {
      environment: cluster.environment,
      apiUrl: cluster.apiUrl,
      tlsMode: detail.tlsMode,
      isEnabled,
    });
    return response(201).json(detail, { headers: { Location: `/api/admin/clusters/${name}` } });
  }),

  http.get('/api/admin/clusters/{name}', ({ params, response }) => {
    const cluster = findCluster(params.name);
    return cluster ? response(200).json(toClusterDetail(cluster)) : clusterNotFound(params.name);
  }),

  // Full replacement of the editable fields; connection-relevant changes make stored tests stale (CLU-4).
  http.put('/api/admin/clusters/{name}', async ({ params, request, response }) => {
    const bound = await bindBody(request, (body) => ({
      fields: bindClusterFields(body),
      version: body.version(),
    }));
    if (bound.error) return bound.error;
    const { fields } = bound.value;
    const loaded = loadCluster(params.name, bound.value.version);
    if (loaded.error) return loaded.error;
    const { cluster } = loaded;

    const next = { ...fields, displayName: fields.displayName ?? cluster.name };
    const changedFields = (Object.keys(next) as (keyof ClusterFields)[]).filter(
      (key) => next[key] !== cluster[key],
    );
    if (changedFields.length === 0) return response(200).json(toClusterDetail(cluster));

    const now = new Date().toISOString();
    const actor = actorName();
    if (changedFields.some((key) => key === 'apiUrl' || key === 'caBundle' || key === 'skipTlsVerify')) {
      cluster.connectionSettingsChangedAt = now;
    }
    Object.assign(cluster, next, { updatedAt: now, updatedBy: actor, version: cluster.version + 1 });
    auditCluster(cluster, 'cluster.updated', `${actor} updated cluster ${cluster.name}.`, { changedFields });
    return response(200).json(toClusterDetail(cluster));
  }),

  http.post('/api/admin/clusters/{name}/enable', async ({ params, request, response }) => {
    const version = await bindVersion(request);
    if (version.error) return version.error;
    const loaded = loadCluster(params.name, version.value);
    if (loaded.error) return loaded.error;
    setEnabled(loaded.cluster, true);
    return response(200).json(toClusterDetail(loaded.cluster));
  }),

  http.post('/api/admin/clusters/{name}/disable', async ({ params, request, response }) => {
    const version = await bindVersion(request);
    if (version.error) return version.error;
    const loaded = loadCluster(params.name, version.value);
    if (loaded.error) return loaded.error;
    setEnabled(loaded.cluster, false);
    return response(200).json(toClusterDetail(loaded.cluster));
  }),

  // CLU-6: only disabled clusters can be deleted; their credentials and grants go with them.
  http.delete('/api/admin/clusters/{name}', ({ params, response }) => {
    const cluster = findCluster(params.name);
    if (!cluster) return clusterNotFound(params.name);
    if (cluster.isEnabled) {
      return problem(409, {
        code: 'Clusters.NotDisabled',
        detail: `Disable ${cluster.name} before deleting it.`,
      });
    }
    const credentialCount = mockDb.credentials.filter((c) => c.clusterName === cluster.name).length;
    const grantCount = mockDb.grants.filter((g) => g.clusterName === cluster.name).length;
    mockDb.clusters = mockDb.clusters.filter((c) => c !== cluster);
    mockDb.credentials = mockDb.credentials.filter((c) => c.clusterName !== cluster.name);
    mockDb.grants = mockDb.grants.filter((g) => g.clusterName !== cluster.name);
    const actor = actorName();
    auditCluster(cluster, 'cluster.deleted', `${actor} deleted cluster ${cluster.name}.`, {
      credentialCount,
      grantCount,
    });
    return response(204).empty();
  }),

  http.get('/api/admin/clusters/{name}/grants', ({ params, response }) => {
    if (!findCluster(params.name)) return clusterNotFound(params.name);
    const grants = mockDb.grants
      .filter((grant) => grant.clusterName === params.name)
      .sort((a, b) => ordinal(a.username, b.username));
    return response(200).json(grants.map((grant) => toGrant(grant)));
  }),
];
