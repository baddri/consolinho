import {
  ClipboardCopy,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ClusterDetail } from '@/shared/api';
import { EnvironmentLabel, RelativeTime } from '@/shared/ui';
import { CaCertificatesTable } from './CaCertificatesTable';
import { ClusterStatusLabel } from './ClusterStatusLabel';
import { TlsModeLabel } from './TlsModeLabel';

/** Placeholder for missing values, as elsewhere in the console. */
const EMPTY = '—';

/** Link target of "View audit entries": the audit log filtered to the cluster (CLU-8, AUD-4). */
export const clusterAuditPath = (name: string) => `/admin/audit?${new URLSearchParams({ cluster: name })}`;

/** One term / description pair of the list. */
function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  );
}

/** The cluster's own web console, opened in a new tab (it lives on another origin). */
function WebConsoleLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {url} <ExternalLinkAltIcon />
    </a>
  );
}

/** Props for {@link ClusterDetailsTab}. */
export interface ClusterDetailsTabProps {
  cluster: ClusterDetail;
}

/**
 * Details tab of the cluster detail page (CLU-8): connection settings (API URL with copy, web console link, TLS
 * mode), status, counts, change history and a link to the cluster's audit entries, followed by the CA certificates
 * ({@link CaCertificatesTable}, CLU-2). Purely presentational; the page loads the `ClusterDetail`.
 */
export function ClusterDetailsTab({ cluster }: ClusterDetailsTabProps) {
  return (
    <Stack hasGutter>
      <StackItem>
        <DescriptionList isHorizontal aria-label="Cluster details">
          <Detail term="Display name">{cluster.displayName}</Detail>
          <Detail term="Environment">
            <EnvironmentLabel environment={cluster.environment} isCompact />
          </Detail>
          <Detail term="API URL">
            <ClipboardCopy isReadOnly variant="inline-compact" hoverTip="Copy API URL" clickTip="Copied">
              {cluster.apiUrl}
            </ClipboardCopy>
          </Detail>
          <Detail term="Web console">
            {cluster.webConsoleUrl ? <WebConsoleLink url={cluster.webConsoleUrl} /> : EMPTY}
          </Detail>
          <Detail term="Description">{cluster.description ?? EMPTY}</Detail>
          <Detail term="TLS">
            <TlsModeLabel tlsMode={cluster.tlsMode} />
          </Detail>
          <Detail term="Status">
            <ClusterStatusLabel isEnabled={cluster.isEnabled} />
          </Detail>
          <Detail term="Credentials">{cluster.credentialCount}</Detail>
          <Detail term="Users with access">{cluster.grantCount}</Detail>
          <Detail term="Connection settings changed">
            <RelativeTime value={cluster.connectionSettingsChangedAt} />
          </Detail>
          <Detail term="Created">
            <RelativeTime value={cluster.createdAt} /> by {cluster.createdBy}
          </Detail>
          <Detail term="Updated">
            {cluster.updatedAt ? (
              <>
                <RelativeTime value={cluster.updatedAt} /> by {cluster.updatedBy ?? EMPTY}
              </>
            ) : (
              'Never'
            )}
          </Detail>
          <Detail term="Audit">
            <Link to={clusterAuditPath(cluster.name)}>View audit entries</Link>
          </Detail>
        </DescriptionList>
      </StackItem>
      <StackItem>
        <CaCertificatesTable cluster={cluster} />
      </StackItem>
    </Stack>
  );
}
