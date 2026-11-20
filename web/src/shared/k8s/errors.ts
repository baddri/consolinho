import { z } from 'zod';
import { ApiError, apiErrorFromProblemBody } from '@/shared/api';

/** Lenient field reader: a wrong type becomes `undefined` instead of failing the whole body. */
const lenientString = z.string().optional().catch(undefined);

/** Defensive reader of a Kubernetes `Status` body (contract §4: any non-ProblemDetails error body). */
const statusBody = z.object({
  kind: z.literal('Status'),
  reason: lenientString,
  message: lenientString,
});

/** Defensive reader of the `Status` object of a watch `ERROR` event. */
const watchErrorStatus = z.object({
  code: z.number().optional().catch(undefined),
  reason: lenientString,
  message: lenientString,
});

/** Parses `text` as JSON; `undefined` for an empty or non-JSON body. */
function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Status text of `response`, or a generic title when the server sent none (HTTP/2 has no reason phrase). */
function statusTitle(response: Response): string {
  return response.statusText || `Request failed with HTTP ${response.status}`;
}

/**
 * Maps a non-2xx proxy response to the registered {@link ApiError} (ADR-0022 §2, contract §4):
 * - `application/problem+json` — an error of FleetConsole itself (`Proxy.*`, `Auth.*`), read like every Api error;
 * - a Kubernetes `Status` body — `code: "Kubernetes.<reason>"`, `title: reason`, `detail: message`;
 * - anything else — the HTTP status text.
 *
 * The body is consumed. Never rejects: an unreadable body degrades to the status-text case.
 */
export async function k8sErrorFromResponse(response: Response): Promise<ApiError> {
  const text = await response.text().catch(() => '');
  const body = parseJson(text);
  if (response.headers.get('Content-Type')?.includes('application/problem+json')) {
    return apiErrorFromProblemBody(response, body);
  }
  const status = statusBody.safeParse(body);
  if (status.success) {
    const { reason, message } = status.data;
    return new ApiError({
      status: response.status,
      code: reason ? `Kubernetes.${reason}` : undefined,
      title: reason ?? statusTitle(response),
      detail: message,
    });
  }
  return new ApiError({ status: response.status, title: statusTitle(response) });
}

/**
 * Maps the `Status` of a watch `ERROR` event (e.g. `410 Expired` after compaction) to an {@link ApiError} shaped like
 * the HTTP error it stands for, so the watch manager handles both the same way.
 */
export function k8sErrorFromStatus(status: unknown): ApiError {
  const parsed = watchErrorStatus.safeParse(status);
  const fields: z.infer<typeof watchErrorStatus> = parsed.success ? parsed.data : {};
  const code = fields.code ?? 500;
  return new ApiError({
    status: code,
    code: fields.reason ? `Kubernetes.${fields.reason}` : undefined,
    title: fields.reason ?? `Watch failed with HTTP ${code}`,
    detail: fields.message,
  });
}
