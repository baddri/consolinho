import { Content, Skeleton, Tooltip } from '@patternfly/react-core';
import { useSystemInfo } from '@/shared/api';
import { PRODUCT_NAME } from '@/shared/branding';
import { formatVersion } from './formatVersion';

/**
 * The version label in the footer. When the version was abbreviated (commit SHA cut to 7 characters), the label is
 * keyboard-focusable and a PatternFly Tooltip shows the full value on hover or focus; the tooltip is wired to the
 * label via `aria-describedby`, so screen readers announce the full version too.
 */
function VersionLabel({ version }: { version: string }) {
  const { short, full, isAbbreviated } = formatVersion(version);
  if (!isAbbreviated) {
    return <span>{short}</span>;
  }
  return (
    <Tooltip content={`Version ${full}`}>
      {/* A focusable trigger is how PatternFly makes tooltips on static text keyboard-accessible. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span tabIndex={0}>{short}</span>
    </Tooltip>
  );
}

/**
 * Shows the FleetConsole version and environment from `GET /api/system/info`, with loading and error states.
 * The version is shown in its compact form (see `formatVersion`) so it fits the sidebar; the text may still wrap
 * (`pf-v6-u-text-break-word`) so unusually long values never overflow the sidebar edge.
 */
export function SystemInfoFooter() {
  const { data, isPending, isError } = useSystemInfo();

  if (isPending) {
    return <Skeleton width="60%" screenreaderText="Loading version information" />;
  }
  if (isError) {
    return <Content component="small">Version information unavailable</Content>;
  }
  return (
    <Content component="small" className="pf-v6-u-text-break-word">
      {PRODUCT_NAME} <VersionLabel version={data.version} /> · {data.environment}
    </Content>
  );
}
