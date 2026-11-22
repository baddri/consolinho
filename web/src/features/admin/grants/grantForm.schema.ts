import { z } from 'zod';
/**
 * Client-side rules of the grant dialog (GRANT-2/3); the Api stays authoritative. `target` is the user the admin picks
 * on the cluster's Access tab; the server's `username` errors are mapped onto it (`fieldMap`). In edit mode it is fixed.
 */
export function grantFormSchema() {
  return z.object({
    target: z.string().min(1, 'Select a user.'),
    credentialId: z.string().min(1, 'Select a credential.'),
    accessMode: z.enum(['readOnly', 'readWrite']),
    // Edit only: the version the shown values are based on. Changed only by opening the dialog or "Reload latest
    // values" (`form.reset`), never by a background refetch, so a stale save stays a 409 (ADM-4). Unused on create.
    version: z.number(),
  });
}

/** Values of the grant dialog. */
export type GrantFormValues = z.infer<ReturnType<typeof grantFormSchema>>;
