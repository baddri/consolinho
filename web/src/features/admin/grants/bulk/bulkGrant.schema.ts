import { z } from 'zod';

/**
 * Client rules of the bulk grant wizard (GRANT-4); the Api stays authoritative and all-or-nothing. `clusters` is the
 * step 1 selection; `items` are the review rows built from it in display order — their indexes are the request's, so
 * server errors keyed `items[i].…` land on the matching row.
 */
export const bulkGrantSchema = z.object({
  clusters: z.array(z.string()).min(1, 'Select at least one cluster.'),
  accessMode: z.enum(['readOnly', 'readWrite']),
  preferredCredentialName: z.string(),
  items: z
    .array(
      z.object({
        clusterName: z.string(),
        credentialId: z.string().min(1, 'Select a credential.'),
      }),
    )
    .min(1, 'Select at least one cluster.'),
});

/** Values of the bulk grant wizard. */
export type BulkGrantFormValues = z.infer<typeof bulkGrantSchema>;

/** Starting values: nothing selected, read only (GRANT-2 default). */
export const BULK_GRANT_DEFAULTS: BulkGrantFormValues = {
  clusters: [],
  accessMode: 'readOnly',
  preferredCredentialName: '',
  items: [],
};
