import type { ReactNode } from 'react';
import {
  Alert,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListTermHelpText,
  DescriptionListTermHelpTextButton,
  PageSection,
  Popover,
  Skeleton,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { clusterCurrentVersion } from '@/shared/health';
import { ClusterVersionModel, type ClusterVersion } from '@/shared/k8s';
import { ConsoleEmptyState, DASH, SectionHeading, Timestamp } from '@/shared/ui';
import { isForbidden, ResourceErrorState } from '../components/ResourceErrorState';
import styles from './ClusterSettings.module.css';
import { useClusterSettings } from './clusterSettingsContext';
import { ClusterUpdateStatus } from './ClusterUpdateStatus';
import { availableVersions, clusterUpdateView } from './clusterUpdateView';

/** One term + description of a details list; `term` may be a help term ({@link ChannelTerm}). */
function Item({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <DescriptionListGroup>
      {typeof term === 'string' ? <DescriptionListTerm>{term}</DescriptionListTerm> : term}
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  );
}

/** OCP `ChannelHeader`: the "Channel" term as a help popover explaining update channels. */
function ChannelTerm() {
  return (
    <DescriptionListTermHelpText>
      <Popover
        headerContent="Channel"
        bodyContent={
          <Content>
            <Content component="p">
              Channels help to control the pace of updates and recommend the appropriate release versions.
              Update channels are tied to a minor version of the platform, for example 4.18.
            </Content>
          </Content>
        }
      >
        <DescriptionListTermHelpTextButton>Channel</DescriptionListTermHelpTextButton>
      </Popover>
    </DescriptionListTermHelpText>
  );
}

/**
 * OCP's `co-cluster-settings` box: the current (or, while updating, last completed) version, the update status and the
 * channel, read-only — no "Select a version", channel edit or update graph (CP5 Q9).
 */
function VersionBox({ cv }: { cv: ClusterVersion }) {
  const update = clusterUpdateView(cv);
  const settled = update.kind === 'upToDate' || update.kind === 'available';
  // OCP `CurrentVersion`: the desired version once settled, else the last completed one.
  const version = settled
    ? (cv.status?.desired?.version ?? clusterCurrentVersion(cv))
    : clusterCurrentVersion(cv);
  return (
    <div className={styles.settings}>
      <div className={styles.row}>
        <div className={`${styles.section} ${styles.current}`}>
          <DescriptionList className={styles.details}>
            <Item term={settled ? 'Current version' : 'Last completed version'}>{version ?? 'None'}</Item>
          </DescriptionList>
        </div>
        <div className={styles.section}>
          <div className={styles.row}>
            <DescriptionList className={`${styles.details} ${styles.status}`}>
              <Item term="Update status">
                <ClusterUpdateStatus update={update} />
              </Item>
            </DescriptionList>
            <DescriptionList className={styles.details}>
              <Item term={<ChannelTerm />}>
                {(cv.spec?.channel ?? '') === '' ? 'Not configured' : cv.spec?.channel}
              </Item>
            </DescriptionList>
          </div>
        </div>
      </div>
    </div>
  );
}

/** OCP "Desired release image": the registry part subtle, the digest emphasised. */
function ReleaseImage({ image }: { image: string | undefined }) {
  const parts = image?.split('@') ?? [];
  if (parts.length !== 2) return <>{image ?? DASH}</>;
  return (
    <>
      <span className="pf-v6-u-text-color-subtle">{parts[0]}@</span>
      {parts[1]}
    </>
  );
}

/** "Update history" (OCP `ClusterVersionDetailsTable`): compact table of `status.history`, newest first. */
function UpdateHistory({ cv }: { cv: ClusterVersion }) {
  const history = cv.status?.history ?? [];
  return (
    <PageSection hasBodyWrapper={false} className={styles.pane} aria-label="Update history">
      <SectionHeading text="Update history" />
      {history.length === 0 ? (
        <ConsoleEmptyState>No History found</ConsoleEmptyState>
      ) : (
        <>
          <Content>
            <Content component="p" className="pf-v6-u-mt-xs pf-v6-u-mb-lg">
              There is a threshold for rendering update data which may cause gaps in the information below.
            </Content>
          </Content>
          <Table aria-label="Update history" variant="compact" gridBreakPoint="">
            <Thead>
              <Tr>
                <Th>Version</Th>
                <Th>State</Th>
                <Th>Started</Th>
                <Th>Completed</Th>
              </Tr>
            </Thead>
            <Tbody>
              {history.map((entry, i) => (
                // History has no ids; entries never reorder within one object.
                <Tr key={`${entry.version}-${i}`}>
                  <Td modifier="breakWord">{entry.version || DASH}</Td>
                  <Td>{entry.state}</Td>
                  <Td>
                    <Timestamp value={entry.startedTime} />
                  </Td>
                  <Td>{entry.completionTime ? <Timestamp value={entry.completionTime} /> : DASH}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </>
      )}
    </PageSection>
  );
}

/** The loaded Details tab: version box, cluster facts, then the update history. */
function ClusterVersionDetailsBody({ cv }: { cv: ClusterVersion }) {
  const versions = availableVersions(cv);
  return (
    <>
      <PageSection hasBodyWrapper={false} className={styles.pane}>
        <VersionBox cv={cv} />
        <DescriptionList>
          <Item term="Cluster ID">
            <span className="pf-v6-u-word-break-break-all">{cv.spec?.clusterID ?? DASH}</span>
          </Item>
          <Item term="Desired release image">
            <span className="pf-v6-u-word-break-break-all">
              <ReleaseImage image={cv.status?.desired?.image} />
            </span>
          </Item>
          <Item term="Available versions">
            {versions.length === 0 ? 'None' : versions.map((version) => <div key={version}>{version}</div>)}
          </Item>
        </DescriptionList>
      </PageSection>
      <UpdateHistory cv={cv} />
    </>
  );
}

/**
 * Details tab of Cluster Settings (CS-2, OCP `ClusterVersionDetailsTable`): the ClusterVersion `version`, read-only.
 * A forbidden read is an inline alert in the tab (the page and its other tab stay usable); other errors are the
 * resource error state with retry. Lazy route module.
 */
export function ClusterVersionDetails() {
  const { cluster, clusterVersion } = useClusterSettings();
  const { data, error } = clusterVersion;
  if (error && isForbidden(error)) {
    return (
      <PageSection hasBodyWrapper={false} className={styles.pane}>
        <Alert variant="warning" isInline title="Restricted access">
          The service account for {cluster} can&apos;t get {ClusterVersionModel.plural}, so the cluster
          version and update status aren&apos;t shown.
        </Alert>
      </PageSection>
    );
  }
  if (error) {
    return (
      <PageSection hasBodyWrapper={false} className={styles.pane}>
        <ResourceErrorState
          error={error}
          cluster={cluster}
          model={ClusterVersionModel}
          verb="get"
          onRetry={() => {
            clusterVersion.refetch();
          }}
        />
      </PageSection>
    );
  }
  if (!data) {
    return (
      <PageSection hasBodyWrapper={false} className={styles.pane}>
        <Skeleton height="120px" screenreaderText="Loading cluster version" />
      </PageSection>
    );
  }
  return <ClusterVersionDetailsBody cv={data} />;
}
