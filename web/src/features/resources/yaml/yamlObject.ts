import { isMap, parseDocument, stringify } from 'yaml';
import type { K8sResource } from '@/shared/k8s';

/** Options of {@link toEditorText}. */
export interface EditorTextOptions {
  /** Keep `metadata.managedFields` (server bookkeeping that buries the object, hidden by default — UI-6). */
  showManagedFields: boolean;
}

/** `obj` without `metadata.managedFields`; the input is not modified. */
function withoutManagedFields<T extends K8sResource>(obj: T): T {
  const metadata = { ...obj.metadata };
  delete metadata.managedFields;
  return { ...obj, metadata };
}

/** The YAML text the editor shows for `obj` (UI-6). */
export function toEditorText(obj: K8sResource, { showManagedFields }: EditorTextOptions): string {
  return stringify(showManagedFields ? obj : withoutManagedFields(obj));
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
 * single object, or a changed `apiVersion`/`kind`/`metadata.name`/`metadata.namespace`. The body omits
 * `metadata.managedFields` (the API server keeps them) and always carries `original`'s `resourceVersion` — the version
 * the edit started from — so a concurrent change answers 409 instead of being silently overwritten, even if the user
 * edited or removed the field.
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
  const obj = withoutManagedFields(value);
  return { ok: true, obj: { ...obj, metadata: { ...obj.metadata, resourceVersion: original.metadata.resourceVersion } } };
}
