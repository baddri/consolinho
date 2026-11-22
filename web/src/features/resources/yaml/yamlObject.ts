import { isMap, isScalar, parseDocument, stringify } from 'yaml';
import type { K8sResource } from '@/shared/k8s';

/**
 * The YAML text the editor shows for `obj` (UI-6), like OCP's `safeDump(obj, { lineWidth: -1 })`: keys in the order
 * the API returned them (`kind` first from a real cluster, never reordered), `metadata.managedFields` included (the
 * editor folds it, see {@link managedFieldsLine}), no line folding, single quotes, and timestamp-like strings quoted as
 * js-yaml does (the `timestamp` tag makes them ambiguous, so they get quoted).
 */
export function toEditorText(obj: K8sResource): string {
  return stringify(obj, { lineWidth: 0, singleQuote: true, customTags: ['timestamp'] });
}

/**
 * The 1-based line of the `managedFields:` key under the top-level `metadata`, or `undefined` when there is none or the
 * text doesn't parse: the line the editor folds on load (OCP `yaml-editor-utils.ts` `registerAutoFold`).
 */
export function managedFieldsLine(text: string): number | undefined {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return undefined;
  const metadata = doc.get('metadata', true);
  if (!isMap(metadata)) return undefined;
  const key = metadata.items.map((pair) => pair.key).find((k) => isScalar(k) && k.value === 'managedFields');
  const offset = isScalar(key) ? key.range?.[0] : undefined;
  if (offset === undefined) return undefined;
  return text.slice(0, offset).split('\n').length;
}

/** Result of {@link parseEdited}: the object to PUT, or a client-side error shown instead of sending a request. */
export type ParseEditedResult = { ok: true; obj: K8sResource } | { ok: false; message: string };

/** Fields that identify the object: changing them would address another object, which an update can't do. */
const IDENTITY_FIELDS: { label: string; read: (obj: K8sResource) => unknown }[] = [
  { label: 'apiVersion', read: (obj) => obj.apiVersion },
  { label: 'kind', read: (obj) => obj.kind },
  { label: 'metadata.name', read: (obj) => obj.metadata.name },
  { label: 'metadata.namespace', read: (obj) => obj.metadata.namespace },
];

/** Whether `value` looks like a Kubernetes object: a map whose `metadata` is a map too. */
function isResourceLike(value: unknown): value is K8sResource {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { metadata } = value as { metadata?: unknown };
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata);
}

/**
 * Turns the edited text into the `PUT` body (UI-7, ADR-0024 §5), or explains why it can't be sent: invalid YAML, not a
 * single object, or a changed `apiVersion`/`kind`/`metadata.name`/`metadata.namespace`. The body is the edited object
 * as is (`metadata.managedFields` included, like OCP), except that it always carries `original`'s `resourceVersion` —
 * the version the edit started from — so a concurrent change answers 409 instead of being silently overwritten, even if
 * the user edited or removed the field.
 */
export function parseEdited(text: string, original: K8sResource): ParseEditedResult {
  const doc = parseDocument(text);
  const [syntaxError] = doc.errors;
  if (syntaxError) {
    return { ok: false, message: `Invalid YAML: ${syntaxError.message}` };
  }
  const value: unknown = doc.toJS();
  if (!isMap(doc.contents) || !isResourceLike(value)) {
    return { ok: false, message: 'The YAML must describe one object with apiVersion, kind and metadata.' };
  }
  for (const { label, read } of IDENTITY_FIELDS) {
    if (read(value) !== read(original)) {
      return { ok: false, message: `${label} can't be changed here: it identifies the object.` };
    }
  }
  return {
    ok: true,
    obj: { ...value, metadata: { ...value.metadata, resourceVersion: original.metadata.resourceVersion } },
  };
}
