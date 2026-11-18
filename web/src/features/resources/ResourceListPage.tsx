import { useParams } from 'react-router';
import { PlaceholderPage } from '@/shared/ui';

/**
 * Generic resource list for namespaced (`/c/:cluster/ns/:namespace/:resource`) and cluster-scoped
 * (`/c/:cluster/cluster/:resource`) kinds. Placeholder until the resource registry exists; namespace `all` will mean
 * all namespaces.
 */
export function ResourceListPage() {
  const { cluster, namespace, resource } = useParams();
  return (
    <PlaceholderPage title={`Resource list: ${resource ?? ''}`} details={{ cluster, namespace, resource }} />
  );
}
