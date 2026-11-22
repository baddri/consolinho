import { useK8sList, PodModel, type Pod } from '@/shared/k8s';
import { labelSelectorString } from '../registry/columns';
import {
  podRingLabel,
  ringPodStatus,
  RING_COLORS,
  type ReplicatedWorkload,
  type RingPodStatus,
} from './podRing';
import styles from './PodRing.module.css';

/** OCP `PodStatus` defaults (`calculateRadius(130)`): 130px ring, 10px stroke, 6.25px inset. */
const SIZE = 130;
const STROKE = 10;
const RADIUS = SIZE / 2 - (5 / 104) * SIZE - STROKE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** OCP `padAngle` of 2° between segments, as arc length. */
const GAP = (2 / 360) * CIRCUMFERENCE;

/** Pod count per ring status, in {@link RING_COLORS} order, without empty statuses. */
function segments(pods: readonly Pod[]): [RingPodStatus, number][] {
  const counts = new Map<RingPodStatus, number>();
  for (const pod of pods) {
    const status = ringPodStatus(pod);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return (Object.keys(RING_COLORS) as RingPodStatus[]).flatMap((status) => {
    const count = counts.get(status) ?? 0;
    return count > 0 ? [[status, count] as [RingPodStatus, number]] : [];
  });
}

/** The SVG donut: one arc per pod status (starting at 12 o'clock), an outlined empty ring without pods. */
function Ring({ pods }: { pods: readonly Pod[] }) {
  const parts = segments(pods);
  const multiple = parts.length > 1;
  let offset = 0;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`} aria-hidden="true">
      <g transform={`rotate(-90 ${String(SIZE / 2)} ${String(SIZE / 2)})`}>
        {parts.length === 0 ? (
          <circle className={styles.empty} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} />
        ) : (
          parts.map(([status, count]) => {
            const length = (count / pods.length) * CIRCUMFERENCE;
            const visible = multiple ? Math.max(length - GAP, 0) : length;
            const arc = (
              <circle
                key={status}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={RING_COLORS[status]}
                strokeWidth={STROKE}
                strokeDasharray={`${String(visible)} ${String(CIRCUMFERENCE - visible)}`}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return arc;
          })
        )}
      </g>
    </svg>
  );
}

/** Props for {@link PodRing}. */
export interface PodRingProps {
  cluster: string;
  /** The Deployment / ReplicaSet; its `readyReplicas` and `replicas` give the label. */
  workload: ReplicatedWorkload & { metadata?: { namespace?: string } };
  /** Its pod selector (`spec.selector.matchLabels`). */
  selector: Record<string, string> | undefined;
}

/**
 * Read-only OCP `PodRingSet` (`console-shared/src/components/pod/PodRingSet.tsx`) above a workload's details grid: a
 * donut of its live pods coloured by status, with the pod count ("2" / "Pods", "Scaling to 3") in the middle. No scale
 * arrows — FleetConsole has no scale action. An accessible image named by the label and the per-status counts.
 */
export function PodRing({ cluster, workload, selector }: PodRingProps) {
  const pods = useK8sList<Pod>(cluster, PodModel, {
    namespace: workload.metadata?.namespace,
    labelSelector: labelSelectorString(selector),
    enabled: selector !== undefined,
  });
  const list = pods.data ?? [];
  const { title, subTitle } = podRingLabel(workload, list);
  const counts = segments(list)
    .map(([status, count]) => `${String(count)} ${status}`)
    .join(', ');
  return (
    <div className={styles.ring} role="img" aria-label={[title, subTitle, counts].filter(Boolean).join(' ')}>
      <Ring pods={list} />
      <div className={styles.label} aria-hidden="true">
        <span className={styles.title}>{title}</span>
        {subTitle && <span className={styles.subtitle}>{subTitle}</span>}
      </div>
    </div>
  );
}
