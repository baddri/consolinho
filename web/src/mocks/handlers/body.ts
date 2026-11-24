import type { HttpResponse } from 'msw';
import type { HttpValidationProblemDetails } from '@/shared/api';
import { malformedBodyProblem, validationProblem, type FieldErrors } from '../problem';

// Request-body binding and the minimal field validation of the mock (contract §1, §7.2, §8.2, §8.4, §9). Bodies are
// untrusted JSON: the typed request body describes what a *correct* client sends, the mock must also answer incorrect
// ones the way the Api does. Two failure classes, as in ASP.NET:
// - binding (System.Text.Json, strict numbers, enums without integer values): malformed JSON, a property present with
//   the wrong JSON type, a quoted number, an unknown enum value, `null` for a value type → framework 400 *without*
//   `code` (`malformedBodyProblem`);
// - validation (FluentValidation): absent/blank required values and rule violations (regex, length, mutual
//   exclusion, references to unknown things) → 400 `Validation.Failed` with field `errors`.
// Not a full validator — just enough for `applyServerErrors` paths.

/** A parsed JSON object body. */
export type JsonObject = Record<string, unknown>;

/** A non-empty list of enum values (so a placeholder value always exists after a recorded error). */
export type EnumValues<T extends string> = readonly [T, ...T[]];

/** Thrown while binding when the JSON doesn't fit the request type; {@link bindBody} turns it into a framework 400. */
class MalformedBodyError extends Error {}

/** Largest `uint` (`version` is a uint32). */
const MAX_UINT32 = 0xffffffff;
const MAX_INT32 = 0x7fffffff;
const MIN_INT32 = -0x80000000;

/**
 * Reads typed fields from one JSON object and collects validation errors. Binding failures throw
 * {@link MalformedBodyError}; validation failures are recorded and reported together by {@link bindBody}.
 * `prefix` scopes error keys for nested objects (`items[2].`).
 */
export class BodyBinder {
  constructor(
    private readonly body: JsonObject,
    /** Field errors recorded so far (shared with nested binders). */
    readonly errors: FieldErrors,
    private readonly prefix = '',
  ) {}

  /** Records a validation error on `key` (relative to this binder's prefix; `''` = the object itself). */
  error(key: string, message: string): void {
    const path = key === '' ? this.prefix.replace(/\.$/, '') : `${this.prefix}${key}`;
    (this.errors[path] ??= []).push(message);
  }

  /** Required string: absent, `null` or blank → "<label> is required." (returns `''`); non-string → malformed. */
  requiredString(key: string, label: string): string {
    const value = this.body[key];
    if (value === undefined || value === null) {
      this.error(key, `${label} is required.`);
      return '';
    }
    if (typeof value !== 'string') throw new MalformedBodyError();
    if (value.trim() === '') this.error(key, `${label} is required.`);
    return value;
  }

  /** Optional string: `null` when absent, `null` or blank; non-string → malformed. */
  optionalString(key: string): string | null {
    const value = this.body[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new MalformedBodyError();
    return value.trim() === '' ? null : value;
  }

  /** Boolean with the C# default for absent values; anything but `true`/`false` (incl. `null`) → malformed. */
  boolean(key: string, fallback: boolean): boolean {
    const value = this.body[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new MalformedBodyError();
    return value;
  }

  /** Required boolean (no C# default): absent → "<label> is required."; wrong type → malformed. */
  requiredBoolean(key: string, label: string): boolean {
    if (this.body[key] === undefined) {
      this.error(key, `${label} is required.`);
      return false;
    }
    return this.boolean(key, false);
  }

  /**
   * One of `allowed`. Absent → `fallback` (C# default parameter) or "<label> is required."; any other value (unknown
   * string, number, `null`) → malformed, like `JsonStringEnumConverter(allowIntegerValues: false)`.
   */
  enumValue<T extends string>(key: string, label: string, allowed: EnumValues<T>, fallback?: T): T {
    const value = this.body[key];
    if (value === undefined) {
      if (fallback !== undefined) return fallback;
      this.error(key, `${label} is required.`);
      return allowed[0];
    }
    const match = allowed.find((candidate) => candidate === value);
    if (match === undefined) throw new MalformedBodyError();
    return match;
  }

  /**
   * One of `allowed` for a C# nullable enum with no default (e.g. `distribution`, DIST-4): absent or `null` → `message`
   * as a field error (returns `null`); an unknown string or a non-string → malformed.
   */
  requiredNullableEnum<T extends string>(key: string, message: string, allowed: EnumValues<T>): T | null {
    const value = this.body[key];
    if (value === undefined || value === null) {
      this.error(key, message);
      return null;
    }
    const match = allowed.find((candidate) => candidate === value);
    if (match === undefined) throw new MalformedBodyError();
    return match;
  }

  /** Array of strings (`string[]?` in C#): absent/`null` → `[]`; not an array, or a non-string entry → malformed. */
  stringArray(key: string): string[] {
    const value = this.body[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new MalformedBodyError();
    return value.map((item: unknown) => {
      if (typeof item !== 'string') throw new MalformedBodyError();
      return item;
    });
  }

  /** `version` (uint32). Absent → "Version is required."; quoted, fractional, negative or too large → malformed. */
  version(): number {
    const value = this.body.version;
    if (value === undefined) {
      this.error('version', 'Version is required.');
      return -1;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
      throw new MalformedBodyError();
    }
    return value;
  }

  /**
   * Optional `int?` (C# nullable int32): absent or `null` → `null`; a quoted, fractional or out-of-range number →
   * malformed, like System.Text.Json. Range rules are the caller's (validator) business.
   */
  optionalInt(key: string): number | null {
    const value = this.body[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_INT32 || value > MAX_INT32) {
      throw new MalformedBodyError();
    }
    return value;
  }

  /** Array of JSON objects, each with its own binder scoped `key[i].`; absent/`null` → `[]`; else malformed. */
  objectArray(key: string): BodyBinder[] {
    const value = this.body[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new MalformedBodyError();
    return value.map((item: unknown, index) => {
      if (!isJsonObject(item)) throw new MalformedBodyError();
      return new BodyBinder(item, this.errors, `${this.prefix}${key}[${index}].`);
    });
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Result of {@link bindBody}: the bound value, or the 400 response to send. */
export type Bound<T> =
  { value: T; error?: undefined } | { error: HttpResponse<HttpValidationProblemDetails> };

/**
 * Parses the JSON body and runs `bind` on it: malformed JSON or a binding failure → framework 400 (no `code`);
 * recorded field errors → 400 `Validation.Failed`; otherwise the bound value. Validation that needs the store
 * (unknown user in a grant request, credential of another cluster) belongs in `bind` too: the Api's validators run
 * before the handler, so body problems are reported before route 404s.
 */
export async function bindBody<T>(request: Request, bind: (body: BodyBinder) => T): Promise<Bound<T>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { error: malformedBodyProblem() };
  }
  if (!isJsonObject(parsed)) return { error: malformedBodyProblem() };

  const binder = new BodyBinder(parsed, {});
  let value: T;
  try {
    value = bind(binder);
  } catch (error) {
    if (error instanceof MalformedBodyError) return { error: malformedBodyProblem() };
    throw error;
  }
  return Object.keys(binder.errors).length > 0 ? { error: validationProblem(binder.errors) } : { value };
}

/** Binds a `VersionRequest` (every body-less transition: deactivate, enable, …). */
export function bindVersion(request: Request): Promise<Bound<number>> {
  return bindBody(request, (body) => body.version());
}

/** DNS label (contract §8.2/§8.4): lowercase alphanumerics and '-', starting and ending alphanumeric. */
export const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/** `true` for an absolute `https://` URL with a host (no further checks — the mock's subset of CLU-1). */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
}
