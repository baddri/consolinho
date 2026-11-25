import { HttpResponse } from 'msw';
import type { FleetClusterStatus } from '@/shared/api';
import { currentMockUser } from '../db';
import { fleetScenarioFor, type FleetScenario } from '../fixtures';
import { problem } from '../problem';
import { accessibleClustersOf } from './clusters';
import { http } from './http';

/** Scale of the scenario delays; tests set `0` so the whole stream arrives at once (in delay order). */
let latency = 1;

/** Scales every scenario delay of the fleet stream (`1` = as in `fixtures/fleetStatus.ts`); reset with `1`. */
export function setMockFleetLatency(factor: number): void {
  latency = factor;
}

/**
 * Whether the mock should answer 503 `Fleet.Busy`: the page URL carries `?mockFleet=busy`. MSW resolves requests in
 * the page (browser worker) or the test's jsdom, so `location` is the app's URL in both.
 */
function isBusy(): boolean {
  return new URLSearchParams(globalThis.location.search).get('mockFleet') === 'busy';
}

const encoder = new TextEncoder();

/**
 * Streams one NDJSON line per cluster, each when its scenario delay has passed (so in delay order, like the server's
 * completion order), and closes. Stops when the client aborts or cancels — nothing is written after that.
 */
function fleetStream(lines: readonly { delayMs: number; status: FleetClusterStatus }[], signal: AbortSignal) {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const stop = () => timers.forEach(clearTimeout);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      // "Flush the headers" (see `k8s/watch.ts`): MSW's Node interceptor resolves `fetch` only on a first chunk.
      controller.enqueue(new Uint8Array(0));
      if (lines.length === 0) {
        controller.close();
        return;
      }
      let left = lines.length;
      for (const { delayMs, status } of lines) {
        timers.push(
          setTimeout(() => {
            controller.enqueue(encoder.encode(`${JSON.stringify(status)}\n`));
            left -= 1;
            if (left === 0) controller.close();
          }, delayMs * latency),
        );
      }
      signal.addEventListener('abort', stop, { once: true });
    },
    cancel: stop,
  });
}

/**
 * `GET /api/fleet/status` (contract §2, T-0341): one line per cluster `GET /api/clusters` lists for the session user,
 * from the scenario table `fixtures/fleetStatus.ts`, `checkedAt` = now. `?mockFleet=busy` on the page URL → 503
 * `Fleet.Busy` with `Retry-After: 5`.
 */
export const fleetHandlers = [
  // Untyped: openapi-msw types the ndjson body as one JSON object, not a stream of lines.
  http.untyped.get('*/api/fleet/status', ({ request }) => {
    const user = currentMockUser();
    if (!user) return undefined;
    if (isBusy()) {
      const busy = problem(503, {
        code: 'Fleet.Busy',
        title: 'Service Unavailable',
        detail: 'The fleet status is busy. Try again in a few seconds.',
      });
      busy.headers.set('Retry-After', '5');
      return busy;
    }
    const checkedAt = new Date().toISOString();
    const lines = accessibleClustersOf(user)
      .map((cluster) => {
        const scenario: FleetScenario = fleetScenarioFor(cluster.name, cluster.distribution);
        return { delayMs: scenario.delayMs, status: { ...scenario.line, cluster, checkedAt } };
      })
      .sort((a, b) => a.delayMs - b.delayMs);
    // Chunked like the Api; see `k8s/watch.ts` for why Node's fetch needs it after a client abort.
    return new HttpResponse(fleetStream(lines, request.signal), {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-store',
        'Transfer-Encoding': 'chunked',
      },
    });
  }),
];
