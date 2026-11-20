import {
  findModel,
  modelKey,
  NamespaceModel,
  PodModel,
  ProjectModel,
  type K8sModel,
  type K8sResource,
} from '@/shared/k8s';
import { k8sTime, podObject, runningPodStatus, seedClusterObjects, uidFactory } from './fixtures';

/**
 * Stateful in-memory "etcd" of the mock API servers (T-0070): one store per cluster, created lazily from the seeded
 * fixtures, with a cluster-wide `resourceVersion` counter, a change history (watch replay, 410 after compaction) and
 * listeners (open watch streams). Objects are stored complete (with `apiVersion`/`kind`) and copied on the way in and
 * out, so callers can never mutate the store by accident.
 */

/** One committed change, as a watch would report it. */
export interface StoreChange {
  type: 'ADDED' | 'MODIFIED' | 'DELETED';
  /** The cluster `resourceVersion` the change was committed at. */
  rv: number;
  model: K8sModel;
  object: K8sResource;
}

/** An open watch stream: receives every change of its cluster and is closed by {@link resetK8sStore}. */
export interface StoreListener {
  onChange: (change: StoreChange) => void;
  close: () => void;
}

interface ClusterStore {
  rv: number;
  /** Watches from a `resourceVersion` older than this get `410 Expired`. */
  compactedRv: number;
  /** modelKey → `<namespace>/<name>` → object. */
  objects: Map<string, Map<string, K8sResource>>;
  history: StoreChange[];
  listeners: Set<StoreListener>;
  nextUid: () => string;
}

/** History entries kept before older ones are compacted away (bounds memory in long `dev:mock` sessions). */
const HISTORY_LIMIT = 5_000;

/** First resourceVersion of a fresh store; seed objects get the following ones. */
const INITIAL_RV = 1_000;

const stores = new Map<string, ClusterStore>();

function objectKey(namespace: string | undefined, name: string): string {
  return `${namespace ?? ''}/${name}`;
}

function modelOf(object: K8sResource): K8sModel {
  const model = findModel(object.apiVersion, object.kind);
  if (!model) throw new Error(`[mocks] No K8sModel for ${object.apiVersion} ${object.kind}`);
  return model;
}

function bucket(store: ClusterStore, model: K8sModel): Map<string, K8sResource> {
  const key = modelKey(model);
  let objects = store.objects.get(key);
  if (!objects) {
    objects = new Map();
    store.objects.set(key, objects);
  }
  return objects;
}

/** Commits a change: bumps the cluster rv, stamps it on the object, records history and notifies watches. */
function commit(
  store: ClusterStore,
  type: StoreChange['type'],
  model: K8sModel,
  object: K8sResource,
): K8sResource {
  store.rv += 1;
  const stored: K8sResource = structuredClone({
    ...object,
    metadata: { ...object.metadata, resourceVersion: String(store.rv) },
  });
  const objects = bucket(store, model);
  const key = objectKey(stored.metadata.namespace, stored.metadata.name ?? '');
  if (type === 'DELETED') objects.delete(key);
  else objects.set(key, stored);

  const change: StoreChange = { type, rv: store.rv, model, object: stored };
  store.history.push(change);
  if (store.history.length > HISTORY_LIMIT) {
    const dropped = store.history.splice(0, store.history.length - HISTORY_LIMIT);
    store.compactedRv = dropped.at(-1)?.rv ?? store.compactedRv;
  }
  for (const listener of store.listeners) listener.onChange(structuredClone(change));
  return structuredClone(stored);
}

function createStore(cluster: string): ClusterStore {
  const store: ClusterStore = {
    rv: INITIAL_RV,
    compactedRv: INITIAL_RV,
    objects: new Map(),
    history: [],
    listeners: new Set(),
    nextUid: uidFactory(`${cluster}#runtime`),
  };
  for (const object of seedClusterObjects(cluster)) {
    store.rv += 1;
    bucket(store, modelOf(object)).set(objectKey(object.metadata.namespace, object.metadata.name ?? ''), {
      ...object,
      metadata: { ...object.metadata, resourceVersion: String(store.rv) },
    });
  }
  // The seed is "history before the console connected": watching from before it is already compacted.
  store.compactedRv = store.rv;
  return store;
}

/** The store of `cluster`, seeded on first use. Callers have already checked that the cluster exists. */
function clusterStore(cluster: string): ClusterStore {
  let store = stores.get(cluster);
  if (!store) {
    store = createStore(cluster);
    stores.set(cluster, store);
  }
  return store;
}

/** The cluster's current `resourceVersion` (what a list returns in `metadata.resourceVersion`). */
export function currentResourceVersion(cluster: string): number {
  return clusterStore(cluster).rv;
}

/** The oldest `resourceVersion` a watch or continue token may still start from. */
export function compactedResourceVersion(cluster: string): number {
  return clusterStore(cluster).compactedRv;
}

/**
 * Objects of `model`, optionally only in `namespace`, ordered like etcd keys (namespace, then name). Copies.
 */
export function listObjects(cluster: string, model: K8sModel, namespace?: string): K8sResource[] {
  return [...bucket(clusterStore(cluster), model).entries()]
    .filter(([, object]) => namespace === undefined || object.metadata.namespace === namespace)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, object]) => structuredClone(object));
}

/** One object, or `undefined`. A copy. */
export function getObject(
  cluster: string,
  model: K8sModel,
  namespace: string | undefined,
  name: string,
): K8sResource | undefined {
  const object = bucket(clusterStore(cluster), model).get(
    objectKey(model.namespaced ? namespace : undefined, name),
  );
  return object && structuredClone(object);
}

/**
 * Creates or replaces an object (resolved by `apiVersion`/`kind`). A replacement keeps the stored `uid` and
 * `creationTimestamp`; a creation gets a new uid and the current time unless the object has them. Emits ADDED or
 * MODIFIED. No conflict or validation checks — the API server routes do those before calling this.
 */
export function upsertObject(cluster: string, object: K8sResource): K8sResource {
  const store = clusterStore(cluster);
  const model = modelOf(object);
  const existing = bucket(store, model).get(objectKey(object.metadata.namespace, object.metadata.name ?? ''));
  const metadata = existing
    ? {
        ...object.metadata,
        uid: existing.metadata.uid,
        creationTimestamp: existing.metadata.creationTimestamp,
      }
    : {
        ...object.metadata,
        uid: object.metadata.uid ?? store.nextUid(),
        creationTimestamp: object.metadata.creationTimestamp ?? k8sTime(Date.now()),
      };
  return commit(store, existing ? 'MODIFIED' : 'ADDED', model, { ...object, metadata });
}

/**
 * Deletes an object and returns it, or `undefined` when it does not exist. Deleting a namespace or project deletes
 * its counterpart (a project is a view of its namespace) and every object in that namespace, each with a DELETED.
 */
export function removeObject(
  cluster: string,
  model: K8sModel,
  namespace: string | undefined,
  name: string,
): K8sResource | undefined {
  const store = clusterStore(cluster);
  const key = objectKey(model.namespaced ? namespace : undefined, name);
  const existing = bucket(store, model).get(key);
  if (!existing) return undefined;

  if (model === NamespaceModel || model === ProjectModel) {
    for (const objects of store.objects.values()) {
      for (const object of [...objects.values()]) {
        if (object.metadata.namespace === name) commit(store, 'DELETED', modelOf(object), object);
      }
    }
    const counterpart = model === NamespaceModel ? ProjectModel : NamespaceModel;
    const other = bucket(store, counterpart).get(key);
    if (other) commit(store, 'DELETED', counterpart, other);
  }
  return commit(store, 'DELETED', model, existing);
}

/** Forgets the change history: watches and continue tokens from any `resourceVersion` issued so far get 410. */
export function compactStore(cluster: string): void {
  const store = clusterStore(cluster);
  // Advance the rv first, so every resourceVersion handed out so far is now older than the mark.
  store.rv += 1;
  store.history = [];
  store.compactedRv = store.rv;
}

/** Changes committed after `rv` (oldest first), or `'expired'` when `rv` is older than the compaction mark. */
export function changesSince(cluster: string, rv: number): StoreChange[] | 'expired' {
  const store = clusterStore(cluster);
  if (rv < store.compactedRv) return 'expired';
  return store.history.filter((change) => change.rv > rv).map((change) => structuredClone(change));
}

/** Registers an open watch; returns the unsubscribe function. */
export function subscribe(cluster: string, listener: StoreListener): () => void {
  const { listeners } = clusterStore(cluster);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Clusters whose store has been created (the simulator only touches those). */
export function materializedClusters(): string[] {
  return [...stores.keys()];
}

/** Closes every open watch and drops all stores, so the next request re-seeds from fixtures (`resetMockDb`). */
export function resetK8sStore(): void {
  for (const store of stores.values()) {
    for (const listener of [...store.listeners]) listener.close();
  }
  stores.clear();
}

/**
 * Test helpers over the mock clusters' state (exported as `mockK8s`): arrange objects, assert side effects, force a
 * 410. Changes behave exactly like API writes — they bump the `resourceVersion` and reach open watches.
 */
export const mockK8s = {
  /** Creates or replaces `object` (model resolved from `apiVersion`/`kind`); returns the stored copy. */
  upsert: upsertObject,
  /** Deletes an object; `undefined` when it did not exist. */
  remove: removeObject,
  /** Drops the change history so older `resourceVersion`s get 410 Expired. */
  compact: compactStore,
  /** Reads one object (a copy). */
  get: getObject,
  /** Adds `count` running pods `load-00000…` (label `app=load`) to `namespace`, e.g. for the 2,000-pod test. */
  seedPods(cluster: string, namespace: string, count: number): void {
    const store = clusterStore(cluster);
    for (let i = 0; i < count; i++) {
      const name = `load-${String(i).padStart(5, '0')}`;
      const pod = podObject(
        namespace,
        name,
        store.nextUid(),
        'load',
        'quay.io/example/load:1.0',
        runningPodStatus(0, 30),
      );
      commit(store, 'ADDED', PodModel, pod as K8sResource);
    }
  },
};
