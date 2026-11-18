import { useParams } from 'react-router';
import { NotFoundPage, PlaceholderPage } from '@/shared/ui';
import { ADMIN_SECTIONS } from './adminSections';

/** Admin area page (`/admin/:section`). Unknown sections render the 404 page. Placeholder content. */
export function AdminPage() {
  const { section } = useParams();
  const match = ADMIN_SECTIONS.find((candidate) => candidate.id === section);
  if (!match) {
    return <NotFoundPage />;
  }
  return <PlaceholderPage title={`Admin: ${match.title}`} details={{ section: match.id }} />;
}
