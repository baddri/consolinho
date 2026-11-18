import { useParams } from 'react-router';
import { PlaceholderPage } from '@/shared/ui';

/** Cluster overview (`/c/:cluster/overview`). Placeholder until the home feature is built. */
export function OverviewPage() {
  const { cluster } = useParams();
  return <PlaceholderPage title="Overview" details={{ cluster }} />;
}
