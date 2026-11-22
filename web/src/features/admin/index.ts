// Public API of the admin feature (ADR-0014): the lazily loaded `/fleet/admin` route tree, the legacy `/admin`
// redirect (ADR-0033), its sections for navigation, read-only gating and the admin query keys. Page modules stay
// private so they remain in their own chunks.
export { ADMIN_SECTIONS, type AdminSectionId } from './adminSections';
export { adminKeys, type AuditQueryFilters } from './queryKeys';
export { legacyAdminRoute } from './LegacyAdminRedirect';
export { adminRoute } from './routes';
export { useAdminAccess, type AdminAccess } from './useAdminAccess';
