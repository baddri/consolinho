import { HorizontalPodAutoscalerModel, type HorizontalPodAutoscaler, type K8sResource } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection, Timestamp } from '@/shared/ui';
import { ConditionsTable } from '../../components/ConditionsTable';
import { ObjectReferenceLink } from '../../components/ObjectReferenceLink';
import { MetricsTable } from '../../workloads/hpa/MetricsTable';
import { labelsColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed HorizontalPodAutoscaler (`metadata` always present). */
export type HorizontalPodAutoscalerResource = HorizontalPodAutoscaler & K8sResource;

/** A number as text, "-" when absent (OCP `DetailsItem`'s default value). */
function numberText(value: number | undefined): string {
  return value === undefined ? '-' : String(value);
}

/** The scale target as a kind-badge link (plain badge + name when its kind isn't registered). */
function ScaleTargetLink({ obj }: { obj: HorizontalPodAutoscalerResource }) {
  const target = obj.spec?.scaleTargetRef;
  return (
    <ObjectReferenceLink
      apiVersion={target?.apiVersion}
      kind={target?.kind}
      name={target?.name}
      namespace={obj.metadata.namespace}
    />
  );
}

/**
 * Right column of the Details tab, OCP `HorizontalPodAutoscalersDetails`: Scale target, Min / Max replicas, Last scale
 * time, Current / Desired replicas.
 */
function HorizontalPodAutoscalerDetails({ obj }: { obj: HorizontalPodAutoscalerResource }) {
  return (
    <>
      <DetailsItem label="Scale target" path="spec.scaleTargetRef">
        <ScaleTargetLink obj={obj} />
      </DetailsItem>
      <DetailsItem label="Min replicas" path="spec.minReplicas">
        {numberText(obj.spec?.minReplicas)}
      </DetailsItem>
      <DetailsItem label="Max replicas" path="spec.maxReplicas">
        {numberText(obj.spec?.maxReplicas)}
      </DetailsItem>
      <DetailsItem label="Last scale time" path="status.lastScaleTime">
        <Timestamp value={obj.status?.lastScaleTime} />
      </DetailsItem>
      <DetailsItem label="Current replicas" path="status.currentReplicas">
        {numberText(obj.status?.currentReplicas)}
      </DetailsItem>
      <DetailsItem label="Desired replicas" path="status.desiredReplicas">
        {numberText(obj.status?.desiredReplicas)}
      </DetailsItem>
    </>
  );
}

/** Sections below the details grid (OCP `HorizontalPodAutoscalersDetails`): Metrics, Conditions. */
function HorizontalPodAutoscalerSections({ obj }: { obj: HorizontalPodAutoscalerResource }) {
  return (
    <>
      <DetailsSubsection title="Metrics">
        <MetricsTable hpa={obj} />
      </DetailsSubsection>
      <DetailsSubsection title="Conditions">
        <ConditionsTable conditions={obj.status?.conditions} />
      </DetailsSubsection>
    </>
  );
}

/**
 * HorizontalPodAutoscalers (HPA-1, OCP `hpa.tsx`): list Name, Namespace, Labels, Scale target, Min pods, Max pods;
 * details tabs Details, YAML, Events (no Pods tab); common actions only — OCP's "Edit/Remove HorizontalPodAutoscaler"
 * live in the Deployment menu of the dev console, outside CP4b.
 */
export const horizontalPodAutoscalerDescriptor: ResourceDescriptor<HorizontalPodAutoscalerResource> = {
  model: HorizontalPodAutoscalerModel,
  nav: { section: 'workloads', order: 120 },
  DetailsSection: HorizontalPodAutoscalerDetails,
  ExtraSections: HorizontalPodAutoscalerSections,
  columns: [
    nameColumn(HorizontalPodAutoscalerModel),
    namespaceColumn(HorizontalPodAutoscalerModel),
    labelsColumn(HorizontalPodAutoscalerModel),
    {
      id: 'scaleTarget',
      title: 'Scale target',
      cell: (hpa) => <ScaleTargetLink obj={hpa} />,
      sortValue: (hpa) => hpa.spec?.scaleTargetRef.name ?? '',
    },
    {
      id: 'minReplicas',
      title: 'Min pods',
      cell: (hpa) => numberText(hpa.spec?.minReplicas),
      sortValue: (hpa) => hpa.spec?.minReplicas ?? 1,
    },
    {
      id: 'maxReplicas',
      title: 'Max pods',
      cell: (hpa) => numberText(hpa.spec?.maxReplicas),
      sortValue: (hpa) => hpa.spec?.maxReplicas ?? 0,
    },
  ],
};
