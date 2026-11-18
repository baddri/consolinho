import { Label } from '@patternfly/react-core';
import { environmentLabel, type ClusterEnvironment } from './clusters';

/** Compact coloured label for a cluster's environment (prod = red, staging = orange, dev = green). */
export function ClusterEnvironmentLabel({ environment }: { environment: ClusterEnvironment }) {
  const { text, color } = environmentLabel(environment);
  return (
    <Label color={color} isCompact>
      {text}
    </Label>
  );
}
