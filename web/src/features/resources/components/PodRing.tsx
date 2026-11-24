import { useState } from 'react';
import { Bullseye, Button, Split, SplitItem } from '@patternfly/react-core';
import { RhUiCaretDownIcon, RhUiCaretUpIcon } from '@patternfly/react-icons';
import { useDebouncedCallback } from 'use-debounce';
import {
  useK8sList,
  labelSelectorString,
  PodModel,
  type HorizontalPodAutoscaler,
  type LabelSelector,
  type Pod,
} from '@/shared/k8s';
import {
  hpaPodRingLabel,
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

/** One scale request 1 s after the last arrow click (ADR-0037 §7; OCP sends on the first click instead). */
export const SCALE_DEBOUNCE_MS = 1000;

/** Scale arrows of {@link PodRing}; see {@link PodRingProps.scale}. */
export interface PodRingScale {
  /** The workload's current `spec.replicas`, as the watch reports it. */
  desired: number;
  /**
   * Sends the scale request; called once per burst of clicks, 1 s after the last one. Settles when the request does;
   * on rejection the ring shows `desired` again.
   */
  onScale: (replicas: number) => Promise<unknown>;
  /**
   * Whether the user may scale (OCP `isScalingAllowed`); the arrows are absent otherwise (DEP-5). A flag rather than
   * omitting `scale`, so the ring is not remounted when the access answer arrives.
   */
  allowed: boolean;
}

/**
 * The pending pod count of the ring arrows: each click moves it at once, one debounced `onScale` follows the last
 * click (`flushOnExit`, so leaving the page still scales). It snaps back to `desired` whenever the watch reports a
 * new `spec.replicas` (the scale landed, or someone else scaled), as OCP's `PodRing` `prevReplicas` reset.
 */
function usePendingScale({ desired, onScale }: PodRingScale) {
  // The count the user clicked to, until the watch reports a new `spec.replicas` or the scale fails.
  const [pending, setPending] = useState<number>();
  const [previous, setPrevious] = useState(desired);
  if (previous !== desired) {
    setPrevious(desired);
    setPending(undefined);
  }
  const send = useDebouncedCallback(
    (replicas: number) => {
      // The mutation already toasts the failure; dropping `pending` shows the latest `desired` again.
      onScale(replicas).catch(() => {
        setPending(undefined);
      });
    },
    SCALE_DEBOUNCE_MS,
    { flushOnExit: true },
  );
  const count = pending ?? desired;
  const change = (delta: number) => {
    const next = Math.max(count + delta, 0);
    setPending(next);
    send(next);
  };
  return { count, change };
}

/** OCP `PodRing` scale arrows: up, then down (disabled at 0), centred beside the ring. */
function ScaleArrows({ count, change }: { count: number; change: (delta: number) => void }) {
  return (
    <Bullseye>
      <div>
        <Button
          variant="plain"
          isBlock
          icon={<RhUiCaretUpIcon />}
          aria-label="Increase the Pod count"
          title="Increase the Pod count"
          onClick={() => change(1)}
        />
        <Button
          variant="plain"
          isBlock
          icon={<RhUiCaretDownIcon />}
          aria-label="Decrease the Pod count"
          title="Decrease the Pod count"
          isDisabled={count <= 0}
          onClick={() => change(-1)}
        />
      </div>
    </Bullseye>
  );
}

/** {@link PodRing} with arrows: the ring labelled with the pending count, the arrows beside it. */
function ScalablePodRing({ scale, ...props }: PodRingProps & { scale: PodRingScale }) {
  const { count, change } = usePendingScale(scale);
  const autoscaled = props.hpa !== undefined;
  return (
    <Split>
      <SplitItem>
        <RingView {...props} replicas={autoscaled ? undefined : count} />
      </SplitItem>
      {scale.allowed && !autoscaled && (
        <SplitItem>
          <ScaleArrows count={count} change={change} />
        </SplitItem>
      )}
    </Split>
  );
}

/** Props for {@link PodRing}. */
export interface PodRingProps {
  cluster: string;
  /** The Deployment / ReplicaSet; its `readyReplicas` and `replicas` give the label. */
  workload: ReplicatedWorkload & { metadata?: { namespace?: string } };
  /** Its pod selector (`spec.selector`, `matchExpressions` included); no pods query without one. */
  selector: LabelSelector | undefined;
  /**
   * Adds OCP's scale arrows (Deployments, DEP-5). Clicks change the shown count at once ("Scaling to n") and send one
   * scale request 1 s after the last click. Without it the ring is read-only.
   */
  scale?: PodRingScale;
  /**
   * The HPA scaling the workload, if any (OCP `useRelatedHPA`): the label becomes "Autoscaled" / "Autoscaling" and
   * "to N Pods", and the scale arrows are hidden, as the autoscaler owns the count.
   */
  hpa?: HorizontalPodAutoscaler;
}

/**
 * Read-only OCP `PodRingSet` (`console-shared/src/components/pod/PodRingSet.tsx`) above a workload's details grid: a
 * donut of its live pods coloured by status, with the pod count ("2" / "Pods", "Scaling to 3"; "Autoscaled" /
 * "to 2 Pods" under an HPA) in the middle, and scale arrows beside it when `scale` is given and no HPA scales the
 * workload. The ring is an accessible image named by the label and the per-status counts.
 */
export function PodRing({ scale, ...props }: PodRingProps) {
  return scale ? <ScalablePodRing {...props} scale={scale} /> : <RingView {...props} />;
}

/** The labelled donut; `replicas` overrides the desired count shown (the arrows' pending count). */
function RingView({
  cluster,
  workload,
  selector,
  hpa,
  replicas,
}: Omit<PodRingProps, 'scale'> & { replicas?: number }) {
  const pods = useK8sList<Pod>(cluster, PodModel, {
    namespace: workload.metadata?.namespace,
    labelSelector: labelSelectorString(selector),
    enabled: selector !== undefined,
  });
  const list = pods.data ?? [];
  const shown = replicas === undefined ? workload : { ...workload, spec: { ...workload.spec, replicas } };
  const { title, subTitle } = hpa ? hpaPodRingLabel(workload, hpa, list) : podRingLabel(shown, list);
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
