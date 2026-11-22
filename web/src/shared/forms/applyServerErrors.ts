import { get, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { errorMessage, isApiError } from '@/shared/api';

/** Contract §2 code of a stale `version` (ADM-4); shown by {@link ConflictAlert}. */
export const CONCURRENCY_CONFLICT_CODE = 'Concurrency.Conflict';

/**
 * Hidden form state that is never a visible field: `version` is the contract-wide concurrency token (contract §1).
 * A server error on it is a client bug and must stay visible in the alert, not be set on a field nobody renders.
 */
const NEVER_FIELDS: ReadonlySet<string> = new Set(['version']);

/**
 * Whether `path` names a rendered field of `values`. Only a leaf value counts: a string, number, boolean or `null`.
 * Arrays and objects are collections (e.g. bulk grant `items`, contract §9.4) that no adapter renders an error for.
 */
function isLeafField(values: FieldValues, path: string): boolean {
  if (path === '' || NEVER_FIELDS.has(path)) {
    return false;
  }
  const value: unknown = get(values, path);
  return value !== undefined && (value === null || typeof value !== 'object');
}

/**
 * A failed submit that could not be shown on a single field: the request as a whole (`""` key), field keys the form
 * does not have, framework 400s, 403/404/409/5xx and network failures. Rendered by `FormProblemAlert` or, when
 * `isConflict`, by `ConflictAlert`.
 */
export interface FormProblem {
  /** ProblemDetails `title`. */
  title: string;
  /** ProblemDetails `detail`, shown verbatim. */
  detail?: string;
  /** Server field messages that did not land on a field. */
  messages: string[];
  /** The edit was based on a stale `version` (`Concurrency.Conflict`): offer "Reload latest values". */
  isConflict: boolean;
}

/** Options of {@link applyServerErrors}. */
export interface ApplyServerErrorsOptions<T extends FieldValues> {
  /** Server key (JSON path exactly as sent, e.g. `credentialId`) → form path, when the form names a field differently. */
  fieldMap?: Record<string, Path<T>>;
  /** Contract `code` → field that shows the error's `detail`, e.g. `{ 'Users.UsernameTaken': 'username' }`. */
  codeToField?: Record<string, Path<T>>;
  /**
   * Array-valued fields rendered by one adapter (`ChipInputField`), e.g. `inspectNamespaces`: a whole-list error
   * (`inspectNamespaces`, "at most 10") lands on the field instead of the alert. Per-entry keys
   * (`inspectNamespaces[2]`) resolve to a string and are fields anyway.
   */
  listFields?: readonly Path<T>[];
}

/**
 * Converts a contract error key (camelCase JSON path, contract §1) to a react-hook-form path:
 * `items[2].credentialId` → `items.2.credentialId`. `''` (whole request) stays `''`; a leading `$`/`$.`
 * (System.Text.Json style) is dropped.
 */
export function toFormPath(jsonPath: string): string {
  return jsonPath
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/^\./, '');
}

/**
 * Maps a failed submit onto a react-hook-form form (ADR-0015 §4) and returns what is left for a form-level alert.
 *
 * - Each 400 `errors` key is converted with {@link toFormPath} (or renamed via `fieldMap`) and set with
 *   `setError(path, { type: 'server', message })` using the key's first message; the first such field is focused.
 * - `codeToField` puts the `detail` of a coded error (typically a 409 like `Users.UsernameTaken`) on a field.
 * - Everything else — the `''` key, keys the form does not have, errors without field mapping, non-API errors —
 *   is returned as a {@link FormProblem}; `null` means every part of the error is shown on a field.
 *
 * **Which keys count as fields:** a path is a field when it resolves in `form.getValues()` (RHF `get`) to a
 * **non-object value**: a string, number, boolean or `null`. Keys that resolve to an array or object, such as bulk
 * grant `items` ("1–100 entries"), and the hidden `version` go to the alert. This uses no RHF internals and no field
 * lists, so every field of a form **must have a default value** (`''` for text, `false` for booleans). A field
 * without one gets its server errors in the form-level alert instead of under the field. Typed input is never reset
 * here. Arrays of strings bound to one adapter opt in with `listFields`.
 */
export function applyServerErrors<T extends FieldValues, TTransformed = T>(
  error: unknown,
  form: UseFormReturn<T, unknown, TTransformed>,
  options: ApplyServerErrorsOptions<T> = {},
): FormProblem | null {
  if (!isApiError(error)) {
    return { title: 'Request failed', detail: errorMessage(error), messages: [], isConflict: false };
  }

  const values = form.getValues();
  const isField = (path: string): path is Path<T> =>
    isLeafField(values, path) || (options.listFields?.some((field) => field === path) ?? false);
  let hasFocused = false;
  const setFieldError = (path: Path<T>, message: string) => {
    form.setError(path, { type: 'server', message }, { shouldFocus: !hasFocused });
    hasFocused = true;
  };

  const codeField = error.code === undefined ? undefined : options.codeToField?.[error.code];
  const isCodeOnField = codeField !== undefined && isField(codeField);
  if (isCodeOnField) {
    setFieldError(codeField, error.detail ?? error.title);
  }

  const unmatched: string[] = [];
  let hasFieldErrors = false;
  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    const path = options.fieldMap?.[key] ?? toFormPath(key);
    const [first] = messages;
    if (first !== undefined && isField(path)) {
      setFieldError(path, first);
      hasFieldErrors = true;
    } else {
      unmatched.push(...messages);
    }
  }

  // Fully shown on fields: a coded error mapped by the form, or a 400 whose every key matched a field.
  if (unmatched.length === 0 && (isCodeOnField || (error.status === 400 && hasFieldErrors))) {
    return null;
  }
  return {
    title: error.title,
    detail: error.detail,
    messages: unmatched,
    isConflict: error.code === CONCURRENCY_CONFLICT_CODE,
  };
}
