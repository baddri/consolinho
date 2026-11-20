import { Label } from '@patternfly/react-core';
import type { K8sModel } from '@/shared/k8s';

/** Props for {@link KindBadge}. */
export interface KindBadgeProps {
  model: Pick<K8sModel, 'abbr' | 'label'>;
}

/**
 * OpenShift-console-style kind badge (`P`, `CM`, `E`, spec §5) shown before resource names and page titles. Purely
 * visual: hidden from assistive technology (the kind is in the title or column header), with the kind name as a hover
 * title.
 */
export function KindBadge({ model }: KindBadgeProps) {
  return (
    <Label isCompact color="blue" title={model.label} aria-hidden>
      {model.abbr}
    </Label>
  );
}
