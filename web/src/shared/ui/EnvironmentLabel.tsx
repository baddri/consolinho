import { Label, type LabelProps } from '@patternfly/react-core';
import type { ClusterEnvironment } from '@/shared/api';

/** Text and PatternFly colour of an environment label. */
export interface EnvironmentLabelStyle {
  text: string;
  color: NonNullable<LabelProps['color']>;
}

const ENVIRONMENT_LABELS: Record<ClusterEnvironment, EnvironmentLabelStyle> = {
  production: { text: 'prod', color: 'red' },
  staging: { text: 'staging', color: 'orange' },
  development: { text: 'dev', color: 'green' },
};

/**
 * Label text and colour for a cluster environment — production is red so users always notice where they are.
 * Exposed for places that cannot render the component (e.g. option text, filter chips).
 */
export function environmentLabel(environment: ClusterEnvironment): EnvironmentLabelStyle {
  return ENVIRONMENT_LABELS[environment];
}

/** Props for {@link EnvironmentLabel}. */
export interface EnvironmentLabelProps {
  environment: ClusterEnvironment;
  /** Smaller label for dense places (masthead switcher, table cells). */
  isCompact?: boolean;
}

/**
 * Coloured label for a cluster's environment (prod red, staging orange, dev green). The one component used by the
 * cluster switcher, admin lists and confirmation dialogs, so the colour code is identical everywhere.
 */
export function EnvironmentLabel({ environment, isCompact = false }: EnvironmentLabelProps) {
  const { text, color } = environmentLabel(environment);
  return (
    <Label color={color} isCompact={isCompact}>
      {text}
    </Label>
  );
}
