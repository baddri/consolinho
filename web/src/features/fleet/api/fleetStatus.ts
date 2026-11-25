import { apiClient, apiErrorFromRejection, unwrap, type FleetClusterStatus } from '@/shared/api';
import { ndjsonLines } from '@/shared/k8s/ndjson';

/**
 * Reads `GET /api/fleet/status` (contract §2, ADR-0041): one {@link FleetClusterStatus} per NDJSON line, yielded as
 * the server flushes it (completion order). A non-2xx answer throws the shared `ApiError` before anything is
 * yielded, so a 503 `Fleet.Busy` keeps its `code`; a read failure mid-stream or a malformed line is an unreadable
 * response (`ApiError`, status 0) — a malformed line is a server bug, not a cluster state. Aborting `signal` cancels
 * the request and with it every probe on the server.
 */
export async function* fetchFleetStatus(signal: AbortSignal): AsyncGenerator<FleetClusterStatus> {
  const body = await unwrap(apiClient.GET('/api/fleet/status', { parseAs: 'stream', signal }));
  // A user without access gets 200 with an empty body, which may come without a stream at all.
  if (!body) return;
  const reader = body.pipeThrough(new TextDecoderStream()).pipeThrough(ndjsonLines()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read().catch(apiErrorFromRejection);
      if (done) return;
      yield parseLine(value);
    }
  } finally {
    // Ends the request when the consumer stops early (query cancelled); a no-op once the stream is done or aborted.
    reader.cancel().catch(() => undefined);
  }
}

/** Parses one line; a malformed line becomes an unreadable-response `ApiError` (the registered error type). */
function parseLine(line: string): FleetClusterStatus {
  try {
    return JSON.parse(line) as FleetClusterStatus;
  } catch (error) {
    return apiErrorFromRejection(error);
  }
}
