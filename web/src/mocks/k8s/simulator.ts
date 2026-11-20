import { EventModel, PodModel, type K8sResource, type Pod } from '@/shared/k8s';
import { crashLoopPodStatus, k8sTime, podEvent, runningPodStatus, WEB_POD_NAMES } from './fixtures';
import { getObject, materializedClusters, upsertObject } from './store';

/** How often the simulated cluster activity happens. */
const TICK_MS = 15_000;

/** The `shop` pod whose state flips. */
const FLAPPING_POD = WEB_POD_NAMES[WEB_POD_NAMES.length - 1] ?? '';

let tick = 0;

/** Flips the flapping pod of `cluster` between CrashLoopBackOff and Running and records an Event about it. */
function flip(cluster: string): void {
  const pod = getObject(cluster, PodModel, 'shop', FLAPPING_POD) as Pod | undefined;
  if (!pod?.metadata) return;
  const container = pod.status?.containerStatuses?.[0];
  const restarts = container?.restartCount ?? 0;
  const crashing = container?.state?.waiting?.reason === 'CrashLoopBackOff';
  const status = crashing ? runningPodStatus(restarts, 0) : crashLoopPodStatus(FLAPPING_POD, restarts + 1);
  const image = pod.spec?.containers[0]?.image ?? '';
  const next: Pod = {
    ...pod,
    status: { ...status, containerStatuses: status.containerStatuses?.map((c) => ({ ...c, image })) },
  };
  upsertObject(cluster, next as K8sResource);

  const now = k8sTime(Date.now());
  const suffix = `sim${tick.toString(16)}`;
  const event = crashing
    ? podEvent(next, undefined, suffix, 'Normal', 'Started', 'Started container web', 1, now)
    : podEvent(
        next,
        undefined,
        suffix,
        'Warning',
        'BackOff',
        `Back-off restarting failed container web`,
        1,
        now,
      );
  if (!getObject(cluster, EventModel, 'shop', event.metadata.name ?? '')) {
    upsertObject(cluster, event as K8sResource);
  }
}

/**
 * Starts simulated cluster activity for `npm run dev:mock` (never in tests): every 15 s the crash-looping `shop` pod
 * of each cluster the app has talked to toggles between Running and CrashLoopBackOff (restarts++) and an Event is
 * added, so watches visibly deliver live updates. Returns a stop function.
 */
export function startK8sSimulator(): () => void {
  const timer = setInterval(() => {
    tick += 1;
    for (const cluster of materializedClusters()) flip(cluster);
  }, TICK_MS);
  return () => clearInterval(timer);
}
