import { ClipboardCopy, Stack, StackItem } from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import { Link } from 'react-router';
import type { ClusterDetail } from '@/shared/api';
import {
  clusterTypeText,
  DetailsColumn,
  DetailsGrid,
  DetailsItem,
  EnvironmentLabel,
  RelativeTime,
  SectionHeading,
} from '@/shared/ui';
import { CaCertificatesTable } from './CaCertificatesTable';
import { ClusterStatusLabel } from './ClusterStatusLabel';
import { TlsModeLabel } from './TlsModeLabel';
import { fleetAdminPath } from '@/shared/routing';

/** Placeholder for missing values, as elsewhere in the console. */
const EMPTY = '—';

/** Link target of "View audit entries": the audit log filtered to the cluster (CLU-8, AUD-4). */
export const clusterAuditPath = (name: string) => fleetAdminPath(`audit?${new URLSearchParams({ cluster: name })}`);

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
 * Details tab of the cluster detail page (CLU-8, `UX.md` §6): "Cluster details" h2 over two vertical columns — what
 * the cluster is (name, display name, environment, distribution, description, status, web console link) left, how it
 * is reached and its history (API URL with copy, TLS mode, counts, change times, audit link) right — followed by the
 * CA certificates ({@link CaCertificatesTable}, CLU-2). Purely presentational; the page loads the `ClusterDetail`.
 */
export function ClusterDetailsTab({ cluster }: ClusterDetailsTabProps) {
  return (
    <Stack hasGutter>
      <StackItem>
        <SectionHeading text="Cluster details" />
        <DetailsGrid>
          <DetailsColumn aria-label="Cluster details">
            <DetailsItem label="Name">{cluster.name}</DetailsItem>
            <DetailsItem label="Display name">{cluster.displayName}</DetailsItem>
            <DetailsItem label="Environment">
              <EnvironmentLabel environment={cluster.environment} isCompact />
            </DetailsItem>
            <DetailsItem label="Distribution">{clusterTypeText(cluster.distribution).word}</DetailsItem>
            <DetailsItem label="Description">{cluster.description ?? EMPTY}</DetailsItem>
            <DetailsItem label="Status">
              <ClusterStatusLabel isEnabled={cluster.isEnabled} />
            </DetailsItem>
            <DetailsItem label="Web console">
              {cluster.webConsoleUrl ? <WebConsoleLink url={cluster.webConsoleUrl} /> : EMPTY}
            </DetailsItem>
          </DetailsColumn>
          <DetailsColumn aria-label="Connection and history">
            <DetailsItem label="API URL">
              <ClipboardCopy isReadOnly variant="inline-compact" hoverTip="Copy API URL" clickTip="Copied">
                {cluster.apiUrl}
              </ClipboardCopy>
            </DetailsItem>
            <DetailsItem label="TLS">
              <TlsModeLabel tlsMode={cluster.tlsMode} />
            </DetailsItem>
            <DetailsItem label="Credentials">{cluster.credentialCount}</DetailsItem>
            <DetailsItem label="Users with access">{cluster.grantCount}</DetailsItem>
            <DetailsItem label="Connection settings changed">
              <RelativeTime value={cluster.connectionSettingsChangedAt} />
            </DetailsItem>
            <DetailsItem label="Created">
              <RelativeTime value={cluster.createdAt} /> by {cluster.createdBy}
            </DetailsItem>
            <DetailsItem label="Updated">
              {cluster.updatedAt ? (
                <>
                  <RelativeTime value={cluster.updatedAt} /> by {cluster.updatedBy ?? EMPTY}
                </>
              ) : (
                'Never'
              )}
            </DetailsItem>
            <DetailsItem label="Audit">
              <Link to={clusterAuditPath(cluster.name)}>View audit entries</Link>
            </DetailsItem>
          </DetailsColumn>
        </DetailsGrid>
      </StackItem>
      <StackItem>
        <CaCertificatesTable cluster={cluster} />
      </StackItem>
    </Stack>
  );
}
