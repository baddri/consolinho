import {
  clusterOperatorStatus,
  clusterOperatorStatusAndMessage,
  clusterOperatorVersion,
} from '@/shared/health';
import { ClusterOperatorModel, type ClusterOperator } from '@/shared/k8s';
import { DASH } from '@/shared/ui';
import {
  ClusterOperatorDetails,
  ClusterOperatorSections,
} from '../../cluster-settings/ClusterOperatorDetails';
import {
  CLUSTER_OPERATOR_STATUS_ORDER,
  ClusterOperatorStatusLabel,
} from '../../cluster-settings/ClusterOperatorStatusLabel';
import styles from '../../cluster-settings/ClusterSettings.module.css';
import { RelatedObjectsTab } from '../../cluster-settings/RelatedObjectsTab';
import { clusterSettingsPath } from '../../paths';
import { nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/**
 * ClusterOperators (CS-3, OCP `cluster-operator.tsx`), cluster-scoped and read-only. No sidebar entry: the list is
 * the ClusterOperators tab of Administration → Cluster Settings, where the details breadcrumb leads (`listPath`).
 * Columns Name, Status, Version, Message; Status sorts by severity (Degraded first). Details: Version, Status,
 * Message, Conditions, Operand versions; tabs Details · YAML · Related objects (no Events tab, as OCP).
 */
export const clusterOperatorDescriptor: ResourceDescriptor<ClusterOperator> = {
  model: ClusterOperatorModel,
  readOnly: true,
  listPath: (cluster) => clusterSettingsPath(cluster, 'clusteroperators'),
  hasEventsTab: false,
  // OCP shows the status as a Details row only, not in the heading.
  hideHeadingStatus: true,
  status: (co) => ({ title: clusterOperatorStatus(co) }),
  DetailsSection: ClusterOperatorDetails,
  ExtraSections: ClusterOperatorSections,
  extraTabs: ['related-objects'],
  KindTabs: { 'related-objects': RelatedObjectsTab },
  filters: [
    {
      id: 'status',
      title: 'Status',
      options: CLUSTER_OPERATOR_STATUS_ORDER.map((value) => ({ value, label: value })),
      matches: (co, values) => values.includes(clusterOperatorStatus(co)),
    },
  ],
  columns: [
    nameColumn(ClusterOperatorModel),
    {
      id: 'status',
      title: 'Status',
      cell: (co) => <ClusterOperatorStatusLabel status={clusterOperatorStatus(co)} />,
      sortValue: (co) => CLUSTER_OPERATOR_STATUS_ORDER.indexOf(clusterOperatorStatus(co)),
    },
    {
      id: 'version',
      title: 'Version',
      cell: (co) => clusterOperatorVersion(co) ?? DASH,
      sortValue: (co) => clusterOperatorVersion(co) ?? null,
    },
    {
      id: 'message',
      title: 'Message',
      cell: (co) => (
        <div className={styles.message}>{clusterOperatorStatusAndMessage(co).message ?? DASH}</div>
      ),
    },
  ],
};
