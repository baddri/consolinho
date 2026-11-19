import { useParams } from 'react-router';
import { PlaceholderPage } from '@/shared/ui';
import { USER_DETAIL_TABS, useAdminTab } from '../adminTabs';

/**
 * `/admin/users/:username[/access]` — user detail with Details and Access tabs; the tab comes from the URL
 * (`useAdminTab`). Placeholder until T-0032 / T-0039. Lazy-loaded by `routes.tsx`.
 */
export function UserDetailPage() {
  const { username } = useParams();
  const tab = useAdminTab(USER_DETAIL_TABS);
  return <PlaceholderPage title="User details" details={{ username, tab }} />;
}
