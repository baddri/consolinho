import { Label } from '@patternfly/react-core';
import type { AccessMode, ClusterEnvironment } from '@/shared/api';
import { ACCESS_MODE_TEXT } from './grantText';

/** Props for {@link AccessModeLabel}. */
export interface AccessModeLabelProps {
  accessMode: AccessMode;
  /** The grant's cluster environment: read-write on production is highlighted. */
  environment: ClusterEnvironment;
}

/**
 * A grant's access mode as a compact label: "Read only" grey, "Read write" blue — orange on a production cluster,
 * the combination admins must notice (GRANT-2).
 */
export function AccessModeLabel({ accessMode, environment }: AccessModeLabelProps) {
  let color: 'grey' | 'blue' | 'orange' = 'grey';
  if (accessMode === 'readWrite') color = environment === 'production' ? 'orange' : 'blue';
  return (
    <Label isCompact color={color}>
      {ACCESS_MODE_TEXT[accessMode]}
    </Label>
  );
}
