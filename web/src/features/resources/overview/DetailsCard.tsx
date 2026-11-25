import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Skeleton,
} from '@patternfly/react-core';
import { RhUiInProgressIcon } from '@patternfly/react-icons';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAccessibleClusters } from '@/features/cluster-context';
import { clusterUpdate, clusterVersionFacts } from '@/shared/health';
import { clusterTypeText, EnvironmentLabel } from '@/shared/ui';
import { useClusterVersion } from '../cluster-settings/useClusterVersion';
import { clusterSettingsPath } from '../paths';
import { CardReadErrors, NotAvailable } from './cardParts';
import styles from './Overview.module.css';
import { useInfrastructure, useKubernetesVersion } from './useOverviewData';

/** Props for {@link DetailItem}. */
interface DetailItemProps {
  title: string;
  isLoading?: boolean;
  /** The read failed (any status): the row says "Not available"; unexpected errors also show in the card alert. */
  error?: unknown;
  /** The value; empty renders "Not available" (OCP `OverviewDetailItem`). */
  children?: ReactNode;
}

/** One Details row (OCP `OverviewDetailItem`): term, then a skeleton, the value or "Not available". */
function DetailItem({ title, isLoading = false, error, children }: DetailItemProps) {
  const value = (() => {
    if (isLoading) return <Skeleton width="60%" screenreaderText={`Loading ${title}`} />;
    if (error || children === undefined || children === null || children === '') return <NotAvailable />;
    return children;
  })();
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{title}</DescriptionListTerm>
      <DescriptionListDescription>{value}</DescriptionListDescription>
    </DescriptionListGroup>
  );
}

/** Props for {@link DetailsCard}. */
export interface DetailsCardProps {
  cluster: string;
  /** Discovery says the cluster serves `config.openshift.io` (OpenShift rows vs the Kubernetes version row). */
  isOpenShift: boolean;
}

/**
 * Details card (OVW-2, OCP `details-card.tsx`): the fleet rows (Cluster, Environment, Distribution) first, then the
 * cluster's own facts — on OpenShift the API address, cluster ID and provider (`infrastructures/cluster`), version and
 * channel (ClusterVersion) with a "View settings" header link; on Kubernetes the `GET /version` row.
 */
export function DetailsCard({ cluster, isOpenShift }: DetailsCardProps) {
  const clusters = useAccessibleClusters();
  const entry = clusters.data?.find((c) => c.name === cluster);
  const cv = useClusterVersion(cluster, { enabled: isOpenShift });
  const infra = useInfrastructure(cluster, isOpenShift);
  const kube = useKubernetesVersion(cluster, !isOpenShift);
  const settingsLink = isOpenShift ? <Link to={clusterSettingsPath(cluster)}>View settings</Link> : undefined;

  return (
    <Card>
      <CardHeader
        actions={
          settingsLink && { actions: settingsLink, hasNoOffset: false, className: styles.headerActions }
        }
      >
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardBody>
        <CardReadErrors
          reads={
            isOpenShift
              ? [
                  ['ClusterVersion', cv.error],
                  ['Infrastructure', infra.error],
                ]
              : [['version', kube.error]]
          }
        />
        <DescriptionList>
          <DetailItem title="Cluster" isLoading={clusters.isPending}>
            {entry?.displayName}
          </DetailItem>
          <DetailItem title="Environment" isLoading={clusters.isPending}>
            {entry && <EnvironmentLabel environment={entry.environment} isCompact />}
          </DetailItem>
          <DetailItem title="Distribution" isLoading={clusters.isPending}>
            {entry && clusterTypeText(entry.distribution).word}
          </DetailItem>
          {isOpenShift ? (
            <>
              <DetailItem title="Cluster API address" isLoading={infra.isPending} error={infra.error}>
                {infra.data?.status?.apiServerURL}
              </DetailItem>
              <DetailItem title="Cluster ID" isLoading={cv.isPending} error={cv.error}>
                {cv.data?.spec?.clusterID}
              </DetailItem>
              <DetailItem title="Infrastructure provider" isLoading={infra.isPending} error={infra.error}>
                {infra.data?.status?.platformStatus?.type ?? infra.data?.status?.platform}
              </DetailItem>
              <DetailItem title="OpenShift version" isLoading={cv.isPending} error={cv.error}>
                {cv.data && <OpenShiftVersion cluster={cluster} facts={clusterVersionFacts(cv.data)} />}
              </DetailItem>
              <DetailItem title="Update channel" isLoading={cv.isPending} error={cv.error}>
                {cv.data?.spec?.channel}
              </DetailItem>
            </>
          ) : (
            <DetailItem title="Kubernetes version" isLoading={kube.isPending} error={kube.error}>
              {kube.data?.gitVersion}
            </DetailItem>
          )}
        </DescriptionList>
      </CardBody>
    </Card>
  );
}

/**
 * OCP `details-card.tsx` `ClusterVersion`: the version, plus an "Updating" link to Cluster Settings while an update
 * runs (then the version shown is the target, as OCP shows the desired version).
 */
function OpenShiftVersion({
  cluster,
  facts,
}: {
  cluster: string;
  facts: ReturnType<typeof clusterVersionFacts>;
}) {
  const update = clusterUpdate(facts);
  if (update?.kind === 'updating') {
    return (
      <>
        <span>{update.version ?? facts?.currentVersion}</span>
        <div>
          <Link to={clusterSettingsPath(cluster)}>
            <RhUiInProgressIcon className="pf-v6-u-mr-sm" />
            Updating
          </Link>
        </div>
      </>
    );
  }
  return facts?.currentVersion ? <span>{facts.currentVersion}</span> : <NotAvailable />;
}
