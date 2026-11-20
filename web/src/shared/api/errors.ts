import { z } from 'zod';
import { PRODUCT_NAME } from '@/shared/branding';

/** Detail of an {@link ApiError} whose request never got an HTTP response. */
const NETWORK_FAILURE_DETAIL = `The ${PRODUCT_NAME} API could not be reached.`;

/** Detail of an {@link ApiError} for a 2xx response whose body could not be read as JSON. */
const UNREADABLE_RESPONSE_DETAIL = `The ${PRODUCT_NAME} API returned a response that could not be read.`;

/** Shown by {@link errorMessage} when an error carries nothing presentable. */
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/** Constructor input of {@link ApiError}; mirrors its public fields. */
export interface ApiErrorInit {
  status: number;
  title: string;
  code?: string | undefined;
  detail?: string | undefined;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  traceId?: string | undefined;
}

/**
 * The only error FleetConsole API hooks throw (ADR-0015 §3): an RFC 9457 ProblemDetails response (contract §1, §2),
 * a non-JSON error response, or a request that got no response at all (`status` 0).
 */
export class ApiError extends Error {
  /** HTTP status; `0` = network failure / no response. */
  readonly status: number;
  /** Stable error code from contract §2 (e.g. `Concurrency.Conflict`); absent for framework 400s and non-JSON errors. */
  readonly code: string | undefined;
  /** Short summary (ProblemDetails `title`, else the HTTP status text). */
  readonly title: string;
  /** Human-readable explanation from the server; show verbatim. */
  readonly detail: string | undefined;
  /** 400 field errors keyed exactly as sent: camelCase JSON paths (`items[2].credentialId`), `""` = whole request. */
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
  /** W3C trace id of the failed request, for support. */
  readonly traceId: string | undefined;

  /** Creates an error from already-parsed fields; use {@link unwrap} to build one from a response. */
  constructor(init: ApiErrorInit) {
    const summary = init.detail ?? init.title;
    super(init.status === 0 ? `Network error: ${summary}` : `HTTP ${init.status}: ${summary}`);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.fieldErrors = init.fieldErrors ?? {};
    this.traceId = init.traceId;
  }
}

/** Accepts a string, maps anything else (missing, null, wrong type) to `undefined` without failing the whole body. */
const lenientString = z.string().optional().catch(undefined);

/**
 * Defensive reader for ProblemDetails bodies. Each field is parsed independently, so one malformed field never hides
 * the others; `code` and `traceId` are extensions the generated `ProblemDetails` type does not declare.
 */
const problemBody = z.object({
  title: lenientString,
  detail: lenientString,
  code: lenientString,
  traceId: lenientString,
  errors: z.record(z.string(), z.array(z.string())).optional().catch(undefined),
});

/** Builds an {@link ApiError} from a non-2xx response and whatever openapi-fetch parsed as its body. */
function fromErrorResponse(response: Response, body: unknown): ApiError {
  const problem = problemBody.safeParse(body);
  const fields = problem.success ? problem.data : undefined;
  return new ApiError({
    status: response.status,
    title: fields?.title ?? (response.statusText || `Request failed with HTTP ${response.status}`),
    code: fields?.code,
    detail: fields?.detail,
    fieldErrors: fields?.errors ?? {},
    traceId: fields?.traceId,
  });
}

/**
 * Whether a rejection is an aborted request. Checked by name: the DOMException may come from another realm (test
 * environments), where `instanceof` fails.
 */
export function isAbortError(reason: unknown): reason is DOMException {
  return typeof reason === 'object' && reason !== null && 'name' in reason && reason.name === 'AbortError';
}

/** Maps a rejected openapi-fetch call to an {@link ApiError}; cancellations are rethrown unchanged. */
function fromRejection(reason: unknown): never {
  // An aborted request is a cancellation (TanStack Query unmount/refetch), not a failure to report.
  if (isAbortError(reason)) {
    throw reason;
  }
  // openapi-fetch rejects with a SyntaxError when a 2xx body is not valid JSON; fetch itself rejects with TypeError.
  const unreadable = reason instanceof SyntaxError;
  throw new ApiError({
    status: 0,
    title: unreadable ? 'Invalid response' : 'Network error',
    detail: unreadable ? UNREADABLE_RESPONSE_DETAIL : NETWORK_FAILURE_DETAIL,
  });
}

/**
 * Awaits an openapi-fetch call; returns `data` on 2xx with a body, throws {@link ApiError} otherwise (including a 2xx
 * without a body — use {@link unwrapNoContent} for 204 endpoints).
 */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call.catch(fromRejection);
  if (!response.ok) {
    throw fromErrorResponse(response, error);
  }
  if (data === undefined) {
    throw new ApiError({
      status: response.status,
      title: 'Empty response',
      detail: UNREADABLE_RESPONSE_DETAIL,
    });
  }
  return data;
}

/** Same as {@link unwrap} for 204 endpoints: resolves on any 2xx, throws {@link ApiError} otherwise. */
export async function unwrapNoContent(call: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  const { error, response } = await call.catch(fromRejection);
  if (!response.ok) {
    throw fromErrorResponse(response, error);
  }
}

/** Whether `error` is an {@link ApiError}, optionally with the given contract `code` (e.g. `'Users.LastAdmin'`). */
export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** User-facing message: the server's `detail`, else its `title`, else a generic text (never a stack or raw body). */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.detail ?? (error.title || GENERIC_MESSAGE);
  }
  return GENERIC_MESSAGE;
}

/**
 * Builds an {@link ApiError} from a non-2xx response and its parsed JSON body (ProblemDetails fields are read
 * defensively). Exported for clients that do not go through openapi-fetch — the Kubernetes proxy client
 * (`shared/k8s/errors.ts`) uses it for `application/problem+json` answers of the proxy itself.
 */
export const apiErrorFromProblemBody: (response: Response, body: unknown) => ApiError = fromErrorResponse;

/**
 * Maps a rejected `fetch` (network failure, unreadable body) to a thrown {@link ApiError} with `status` 0; aborts are
 * rethrown unchanged. Exported for clients that call `fetch` directly (`shared/k8s/client.ts`).
 */
export const apiErrorFromRejection: (reason: unknown) => never = fromRejection;
