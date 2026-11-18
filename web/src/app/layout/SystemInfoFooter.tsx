import { Content, Skeleton } from '@patternfly/react-core';
import { useSystemInfo } from '@/shared/api';

/** Shows the FleetConsole version and environment from `GET /api/system/info`, with loading and error states. */
export function SystemInfoFooter() {
  const { data, isPending, isError } = useSystemInfo();

  if (isPending) {
    return <Skeleton width="60%" screenreaderText="Loading version information" />;
  }
  if (isError) {
    return <Content component="small">Version information unavailable</Content>;
  }
  return (
    <Content component="small">
      FleetConsole {data.version} · {data.environment}
    </Content>
  );
}
