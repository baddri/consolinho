import { useParams } from 'react-router';
import { PlaceholderPage } from '@/shared/ui';

/**
 * `/admin/clusters/new` (create) and `/admin/clusters/:name/edit` (edit) — one form; the mode follows from whether the
 * route has a `:name`. Placeholder until T-0034. Lazy-loaded by `routes.tsx`.
 */
export function ClusterFormPage() {
  const { name } = useParams();
  return <PlaceholderPage title={name === undefined ? 'Add cluster' : 'Edit cluster'} details={{ name }} />;
}
