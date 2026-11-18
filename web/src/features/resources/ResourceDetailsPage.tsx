import { useParams } from 'react-router';
import { PlaceholderPage } from '@/shared/ui';

/**
 * Generic resource details for namespaced (`.../ns/:namespace/:resource/:name`) and cluster-scoped
 * (`.../cluster/:resource/:name`) kinds. Placeholder until the resource registry exists.
 */
export function ResourceDetailsPage() {
  const { cluster, namespace, resource, name } = useParams();
  return (
    <PlaceholderPage
      title={`Resource details: ${name ?? ''}`}
      details={{ cluster, namespace, resource, name }}
    />
  );
}
