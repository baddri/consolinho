/** Admin area sections, in sidebar order. `id` is the URL segment under `/fleet/admin/`. */
export const ADMIN_SECTIONS = [
  { id: 'users', title: 'Users' },
  { id: 'groups', title: 'Groups' },
  { id: 'clusters', title: 'Clusters' },
  { id: 'credentials', title: 'Credentials' },
  { id: 'audit', title: 'Audit log' },
] as const;

/** URL segment of an admin section. */
export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id'];
