import type { HorizontalPodAutoscaler } from '@/shared/k8s';

type HorizontalPodAutoscalerSpec = NonNullable<HorizontalPodAutoscaler['spec']>;
/** One `spec.metrics[]` entry (autoscaling/v2 `MetricSpec`). */
type MetricSpec = NonNullable<HorizontalPodAutoscalerSpec['metrics']>[number];
/** One `status.currentMetrics[]` entry (autoscaling/v2 `MetricStatus`). */
type MetricStatus = NonNullable<NonNullable<HorizontalPodAutoscaler['status']>['currentMetrics']>[number];
/** Reference to another object (autoscaling/v2 `CrossVersionObjectReference`). */
export type CrossVersionObjectReference = HorizontalPodAutoscalerSpec['scaleTargetRef'];

/** One row of the HPA Metrics table (OCP `hpa.tsx` `MetricsRow`): what is measured, its current and target value. */
export interface MetricRow {
  /** Stable React key: the metric's identity (type + name), suffixed with its index for duplicates. */
  key: string;
  /** Type cell text: "Resource cpu", "requests on pods", an external metric's name, or an unknown `type`. */
  type: string;
  /** Subtle hint after the type: "(as a percentage of request)" for utilization targets, "(unrecognized type)". */
  hint?: string;
  /** For Object metrics, the object the metric describes; the Type cell reads "<name> on <link>". */
  describedObject?: CrossVersionObjectReference;
  /** Current value; undefined when the HPA hasn't reported it (rendered "-", as OCP). */
  current?: string;
  /** Target value; undefined when absent. */
  target?: string;
}

/** Hint OCP shows after a Resource metric whose target is a utilization percentage. */
export const UTILIZATION_HINT = '(as a percentage of request)';

/** Hint OCP shows for a metric type it doesn't know. */
export const UNRECOGNIZED_HINT = '(unrecognized type)';

/**
 * Identity of a metric spec or status: its type plus the name(s) that tell two metrics of that type apart (resource
 * name, container, metric name, described object). Spec and status carry the same identifying fields.
 */
function metricIdentity(metric: MetricSpec | MetricStatus): string {
  switch (metric.type) {
    case 'Resource':
      return `Resource/${metric.resource?.name ?? ''}`;
    case 'ContainerResource':
      return `ContainerResource/${metric.containerResource?.name ?? ''}/${metric.containerResource?.container ?? ''}`;
    case 'Pods':
      return `Pods/${metric.pods?.metric.name ?? ''}`;
    case 'Object':
      return `Object/${metric.object?.metric.name ?? ''}/${metric.object?.describedObject.kind ?? ''}/${metric.object?.describedObject.name ?? ''}`;
    case 'External':
      return `External/${metric.external?.metric.name ?? ''}`;
    default:
      return metric.type;
  }
}

/**
 * Current value of a utilization target, OCP `getResourceUtilization`: "35% (35m)", or "35%" when the average value
 * is absent or "0" (avoids "0% (0)"); undefined without a utilization (0 is a value).
 */
function utilizationText(current: { averageUtilization?: number; averageValue?: string } | undefined): string | undefined {
  const utilization = current?.averageUtilization;
  if (utilization === undefined || !Number.isFinite(utilization)) return undefined;
  const average = current?.averageValue;
  return average && average !== '0' ? `${String(utilization)}% (${average})` : `${String(utilization)}%`;
}

/** Row of a Resource / ContainerResource metric (OCP `resourceRowFn`). */
function resourceRow(
  key: string,
  source: { name: string; target: { averageUtilization?: number; averageValue?: string } },
  type: 'Resource' | 'ContainerResource',
  current: { averageUtilization?: number; averageValue?: string } | undefined,
): MetricRow {
  const utilization = source.target.averageUtilization;
  // OCP tests truthiness: a 0 % target falls back to the average-value form.
  if (utilization) {
    return {
      key,
      type: `${type} ${source.name}`,
      hint: UTILIZATION_HINT,
      current: utilizationText(current),
      target: `${String(utilization)}%`,
    };
  }
  return { key, type: `${type} ${source.name}`, current: current?.averageValue, target: source.target.averageValue };
}

/** The row of one spec metric, given the status metric that matched it (if any). */
function metricRow(key: string, spec: MetricSpec, status: MetricStatus | undefined): MetricRow {
  switch (spec.type) {
    case 'Resource':
      if (spec.resource) return resourceRow(key, spec.resource, 'Resource', status?.resource?.current);
      break;
    case 'ContainerResource':
      if (spec.containerResource)
        return resourceRow(key, spec.containerResource, 'ContainerResource', status?.containerResource?.current);
      break;
    case 'Pods':
      if (spec.pods)
        return {
          key,
          type: `${spec.pods.metric.name} on pods`,
          current: status?.pods?.current.averageValue,
          target: spec.pods.target.averageValue,
        };
      break;
    case 'Object':
      if (spec.object)
        return {
          key,
          type: spec.object.metric.name,
          describedObject: spec.object.describedObject,
          current: status?.object?.current.value,
          target: spec.object.target.value,
        };
      break;
    case 'External':
      if (spec.external)
        return {
          key,
          type: spec.external.metric.name,
          current: status?.external?.current.averageValue ?? status?.external?.current.value,
          target: spec.external.target.averageValue ?? spec.external.target.value,
        };
      break;
  }
  return { key, type: spec.type, hint: UNRECOGNIZED_HINT };
}

/**
 * Rows of the HPA Metrics table (OCP `MetricsTable`): one per `spec.metrics[]`, its current value taken from the
 * `status.currentMetrics[]` entry of the same type and name. OCP pairs them by index, which mislabels values once the
 * controller omits a metric it can't compute; matching by identity keeps a missing current as "-" on its own row.
 */
export function metricRows(hpa: HorizontalPodAutoscaler): MetricRow[] {
  const statuses = new Map<string, MetricStatus>();
  for (const status of hpa.status?.currentMetrics ?? []) {
    const identity = metricIdentity(status);
    if (!statuses.has(identity)) statuses.set(identity, status);
  }
  return (hpa.spec?.metrics ?? []).map((spec, index) => {
    const identity = metricIdentity(spec);
    return metricRow(`${identity}#${String(index)}`, spec, statuses.get(identity));
  });
}
