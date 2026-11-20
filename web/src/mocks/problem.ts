import { HttpResponse } from 'msw';
import type { HttpValidationProblemDetails } from '@/shared/api';

/** Field errors keyed by camelCase JSON path (`items[2].credentialId`); `""` = the whole request (contract §1). */
export type FieldErrors = Record<string, string[]>;

/** Content of a mock error response; `detail` is shown verbatim by the UI. */
export interface ProblemInit {
  /** Stable code from contract §2; omitted for framework errors (malformed JSON). */
  code?: string;
  detail: string;
  title?: string;
  errors?: FieldErrors;
}

const DEFAULT_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
};

const RFC9110_SECTIONS: Record<number, string> = {
  400: '15.5.1',
  401: '15.5.2',
  403: '15.5.4',
  404: '15.5.5',
  409: '15.5.10',
};

let traceCounter = 0;

/** A deterministic W3C `traceparent`-shaped id, unique per response within a test run. */
function nextTraceId(): string {
  traceCounter += 1;
  const hex = traceCounter.toString(16).padStart(8, '0');
  return `00-${hex.repeat(4)}-${hex.repeat(2)}-00`;
}

/**
 * Builds an RFC 9457 ProblemDetails response (`application/problem+json`) the way the Api does: `type`, `title`,
 * `status`, `detail`, the `code`/`traceId` extensions and, for 400s, `errors`.
 */
export function problem(status: number, init: ProblemInit): HttpResponse<HttpValidationProblemDetails> {
  const section = RFC9110_SECTIONS[status];
  const body: HttpValidationProblemDetails = {
    type: section ? `https://tools.ietf.org/html/rfc9110#section-${section}` : null,
    title: init.title ?? DEFAULT_TITLES[status] ?? 'Error',
    status,
    detail: init.detail,
    traceId: nextTraceId(),
    ...(init.code === undefined ? {} : { code: init.code }),
    ...(init.errors === undefined ? {} : { errors: init.errors }),
  };
  return HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } });
}

/** 400 `Validation.Failed` with field `errors` (contract §2). */
export function validationProblem(errors: FieldErrors): HttpResponse<HttpValidationProblemDetails> {
  return problem(400, {
    code: 'Validation.Failed',
    title: 'One or more validation errors occurred.',
    detail: 'Check the highlighted fields and try again.',
    errors,
  });
}

/** Framework 400 (malformed JSON, wrong JSON type): no `code`, like ASP.NET's binder errors. */
export function malformedBodyProblem(): HttpResponse<HttpValidationProblemDetails> {
  return problem(400, { detail: 'The request body is not valid JSON or has the wrong shape.' });
}

/** 409 `Concurrency.Conflict` for a stale `version`; `noun` names the resource ("user", "cluster", …). */
export function conflictProblem(noun: string): HttpResponse<HttpValidationProblemDetails> {
  return problem(409, {
    code: 'Concurrency.Conflict',
    detail: `This ${noun} was changed by someone else. Reload and try again.`,
  });
}
