// Public API of the admin feature (ADR-0014): the lazily loaded `/admin` route tree, its sections for navigation,
// read-only gating and the admin query keys. Page modules stay private so they remain in their own chunks.
export { ADMIN_SECTIONS, type AdminSectionId } from './adminSections';
export { adminKeys, type AuditQueryFilters } from './queryKeys';
export { adminRoute } from './routes';
export { useAdminAccess, type AdminAccess } from './useAdminAccess';
