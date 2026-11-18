import { useParams } from 'react-router';
import { PlaceholderPage } from '@/shared/ui';

/** Cross-kind resource search (`/c/:cluster/search`). Placeholder. */
export function SearchPage() {
  const { cluster } = useParams();
  return <PlaceholderPage title="Search" details={{ cluster }} />;
}
