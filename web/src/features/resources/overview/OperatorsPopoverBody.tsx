import { Stack, StackItem } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ClusterOperatorModel, ClusterServiceVersionModel } from '@/shared/k8s';
import { ResourceLink } from '../components/ResourceLink';
import { ALL_NAMESPACES, clusterSettingsPath, resourcePath } from '../paths';
import { NotAvailable } from './cardParts';
import { HealthIcon, type HealthState } from './HealthItem';
import type { OperatorHealth } from './operatorHealth';
import styles from './Overview.module.css';

/** OCP `StatusPopupSection`: a bold first column with a subtle second column ("Status"), then the rows. */
function PopupSection({
  title,
  installed,
  children,
}: {
  title: string;
  installed?: string;
  children: ReactNode;
}) {
  return (
    <StackItem>
      <div className={styles.popupRow}>
        <div className={styles.popupRowBold}>
          <span>{title}</span>
          {installed !== undefined && (
            <span className={`pf-v6-u-text-color-subtle ${styles.popupDetail}`}>
              {' '}
              ({installed} installed)
            </span>
          )}
        </div>
        <div className="pf-v6-u-text-color-subtle">Status</div>
      </div>
      {children}
    </StackItem>
  );
}

/** OCP `StatusPopup` `Status` row: the subject on the left, subtle status text and its icon on the right. */
function PopupRow({ value, state, children }: { value: string; state: HealthState; children: ReactNode }) {
  return (
    <div className={styles.popupRow}>
      {children}
      <div className={styles.popupStatus}>
        <span className="pf-v6-u-text-color-subtle">{value}</span>
        {state !== 'loading' && <HealthIcon state={state} />}
      </div>
    </div>
  );
}

/** The OLM line of the popover: Failed CSVs out of the installed ones (counted by `useResourceCount`). */
export interface CsvSummary {
  installed: string;
  failed: number;
  error: boolean;
}

/** Props for {@link OperatorsPopoverBody}. */
export interface OperatorsPopoverBodyProps {
  cluster: string;
  /** All ClusterOperators with their health, worst first. */
  healths: readonly OperatorHealth[];
  /** OLM's ClusterServiceVersions, when the cluster serves OLM and the count has loaded. */
  csvs?: CsvSummary;
}

/**
 * Body of the Operators popover (OCP `OperatorsPopup` + `OperatorsSection`): the intro, "Cluster operators (N
 * installed)" with a row per operator that isn't OK (link to its details), or "All available" + "View all"; then the
 * OLM "Operators" section with the Failed ClusterServiceVersion count.
 */
export function OperatorsPopoverBody({ cluster, healths, csvs }: OperatorsPopoverBodyProps) {
  const unhealthy = healths.filter((h) => h.health !== 'ok');
  const csvList = resourcePath(cluster, ClusterServiceVersionModel, { namespace: ALL_NAMESPACES });
  return (
    <Stack hasGutter>
      <StackItem>
        Operators create, configure, and manage applications by extending the Kubernetes API.
      </StackItem>
      <PopupSection title="Cluster operators" installed={String(healths.length)}>
        {unhealthy.map(({ operator, status, health }) => (
          <PopupRow key={operator.metadata.name} value={status} state={health}>
            <ResourceLink model={ClusterOperatorModel} name={operator.metadata.name ?? ''} hideBadge />
          </PopupRow>
        ))}
        {unhealthy.length === 0 && (
          <PopupRow value="All available" state="ok">
            <Link to={clusterSettingsPath(cluster, 'clusteroperators')}>View all</Link>
          </PopupRow>
        )}
      </PopupSection>
      {csvs && (
        <PopupSection title="Operators" installed={csvs.error ? undefined : csvs.installed}>
          {csvs.error ? (
            <NotAvailable />
          ) : (
            <PopupRow
              value={csvs.failed > 0 ? `${csvs.failed} failed` : 'All succeeded'}
              state={csvs.failed > 0 ? 'error' : 'ok'}
            >
              <Link to={csvList}>View all</Link>
            </PopupRow>
          )}
        </PopupSection>
      )}
    </Stack>
  );
}
