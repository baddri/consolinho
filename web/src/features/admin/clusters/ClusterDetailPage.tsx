import { useParams } from 'react-router';
import { PlaceholderPage } from '@/shared/ui';
import { CLUSTER_DETAIL_TABS, useAdminTab } from '../adminTabs';

/**
 * `/admin/clusters/:name[/credentials|/access]` — cluster detail with Details, Credentials and Access tabs; the tab
 * comes from the URL (`useAdminTab`). Placeholder until T-0035 / T-0036 / T-0039. Lazy-loaded by `routes.tsx`.
 */
export function ClusterDetailPage() {
  const { name } = useParams();
  const tab = useAdminTab(CLUSTER_DETAIL_TABS);
  return <PlaceholderPage title="Cluster details" details={{ name, tab }} />;
}
