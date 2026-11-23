import type { HorizontalPodAutoscaler } from '@/shared/k8s';
import { UNRECOGNIZED_HINT, UTILIZATION_HINT, metricRows } from './metrics';

type Spec = NonNullable<HorizontalPodAutoscaler['spec']>;
type Status = NonNullable<HorizontalPodAutoscaler['status']>;

function hpa(metrics: Spec['metrics'], currentMetrics?: Status['currentMetrics']): HorizontalPodAutoscaler {
  return {
    spec: { scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'worker' }, maxReplicas: 5, metrics },
    status: { desiredReplicas: 2, currentMetrics },
  };
}

describe('metricRows', () => {
  it('Resource utilization: "Resource cpu" with the percentage hint, "35% (35m)" of "80%"', () => {
    const rows = metricRows(
      hpa(
        [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } } }],
        [{ type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 35, averageValue: '35m' } } }],
      ),
    );
    expect(rows).toEqual([
      expect.objectContaining({ type: 'Resource cpu', hint: UTILIZATION_HINT, current: '35% (35m)', target: '80%' }),
    ]);
  });

  it('Resource utilization drops a "0" average value and keeps a 0 % current', () => {
    const [row] = metricRows(
      hpa(
        [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } } }],
        [{ type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 0, averageValue: '0' } } }],
      ),
    );
    expect(row?.current).toBe('0%');
  });

  it('Resource average value: no hint, the average values as current and target', () => {
    const [row] = metricRows(
      hpa(
        [{ type: 'Resource', resource: { name: 'memory', target: { type: 'AverageValue', averageValue: '500Mi' } } }],
        [{ type: 'Resource', resource: { name: 'memory', current: { averageValue: '212Mi' } } }],
      ),
    );
    expect(row).toEqual(expect.objectContaining({ type: 'Resource memory', current: '212Mi', target: '500Mi' }));
    expect(row?.hint).toBeUndefined();
  });

  it('Pods metric: "<name> on pods"', () => {
    const [row] = metricRows(
      hpa(
        [{ type: 'Pods', pods: { metric: { name: 'requests' }, target: { type: 'AverageValue', averageValue: '10' } } }],
        [{ type: 'Pods', pods: { metric: { name: 'requests' }, current: { averageValue: '4' } } }],
      ),
    );
    expect(row).toEqual(expect.objectContaining({ type: 'requests on pods', current: '4', target: '10' }));
  });

  it('matches currents by type and name, not index, and leaves a missing current undefined', () => {
    const rows = metricRows(
      hpa(
        [
          { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } } },
          { type: 'Resource', resource: { name: 'memory', target: { type: 'AverageValue', averageValue: '1Gi' } } },
          { type: 'External', external: { metric: { name: 'queue_depth' }, target: { type: 'Value', value: '30' } } },
        ],
        [
          { type: 'External', external: { metric: { name: 'queue_depth' }, current: { value: '12' } } },
          { type: 'Resource', resource: { name: 'memory', current: { averageValue: '600Mi' } } },
        ],
      ),
    );
    expect(rows.map((row) => [row.type, row.current, row.target])).toEqual([
      ['Resource cpu', undefined, '80%'],
      ['Resource memory', '600Mi', '1Gi'],
      ['queue_depth', '12', '30'],
    ]);
  });

  it('Object metric carries the described object; an unknown type is flagged', () => {
    const rows = metricRows(
      hpa([
        {
          type: 'Object',
          object: {
            metric: { name: 'hits' },
            describedObject: { apiVersion: 'v1', kind: 'Service', name: 'web' },
            target: { type: 'Value', value: '100' },
          },
        },
        { type: 'Custom' },
      ]),
    );
    expect(rows[0]).toEqual(expect.objectContaining({ type: 'hits', target: '100' }));
    expect(rows[0]?.describedObject?.name).toBe('web');
    expect(rows[1]).toEqual(expect.objectContaining({ type: 'Custom', hint: UNRECOGNIZED_HINT }));
  });

  it('has no rows without spec metrics', () => {
    expect(metricRows(hpa(undefined))).toEqual([]);
  });
});
