import { PlaceholderPage } from '@/shared/ui';
import { useResourceRoute } from './resourceRoute';

/**
 * Generic resource details (`k8s/ns/:namespace/:plural/:name[/yaml|/events]`, `k8s/cluster/:plural/:name[/…]`).
 * Placeholder until T-0075. Lazy-loaded by `routes.tsx`.
 */
export function ResourceDetailsPage() {
  const { cluster, namespace, plural, name, tab } = useResourceRoute();
  return (
    <PlaceholderPage
      title={`Resource details: ${name ?? ''}`}
      details={{ cluster, namespace, plural, name, tab: tab ?? 'details' }}
    />
  );
}
