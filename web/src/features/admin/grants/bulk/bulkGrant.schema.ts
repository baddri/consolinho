import { z } from 'zod';
import type { GrantSubjectKind } from '@/shared/api';
import { PRIORITY_RANGE_MESSAGE } from '../grantForm.schema';

/**
 * Client rules of the bulk grant wizard (GRANT-4, GPG-3); the Api stays authoritative and all-or-nothing. `clusters`
 * is the step 1 selection; `items` are the review rows built from it in display order — their indexes are the
 * request's, so server errors keyed `items[i].…` land on the matching row. `subjectKind` is fixed by the wizard:
 * groups require one `priority` (1–1000) for every selected cluster, users never send one. `priority` is `null`
 * (not `undefined`) while empty, like the grant dialog's.
 */
export const bulkGrantSchema = z
  .object({
    subjectKind: z.enum(['user', 'group']),
    clusters: z.array(z.string()).min(1, 'Select at least one cluster.'),
    accessMode: z.enum(['readOnly', 'readWrite']),
    priority: z
      .number()
      .int(PRIORITY_RANGE_MESSAGE)
      .min(1, PRIORITY_RANGE_MESSAGE)
      .max(1000, PRIORITY_RANGE_MESSAGE)
      .nullable(),
    preferredCredentialName: z.string(),
    items: z
      .array(
        z.object({
          clusterName: z.string(),
          credentialId: z.string().min(1, 'Select a credential.'),
        }),
      )
      .min(1, 'Select at least one cluster.'),
  })
  .superRefine((values, ctx) => {
    if (values.subjectKind === 'group' && values.priority === null) {
      ctx.addIssue({ code: 'custom', path: ['priority'], message: PRIORITY_RANGE_MESSAGE });
    }
  });

/** Values of the bulk grant wizard. */
export type BulkGrantFormValues = z.infer<typeof bulkGrantSchema>;

/** Starting values for `kind`: nothing selected, read only (GRANT-2 default), no priority yet. */
export const bulkGrantDefaults = (kind: GrantSubjectKind): BulkGrantFormValues => ({
  subjectKind: kind,
  clusters: [],
  accessMode: 'readOnly',
  priority: null,
  preferredCredentialName: '',
  items: [],
});

/** `true` when `priority` is a usable group priority (the access mode step's Next waits for one). */
export const isValidPriority = (priority: number | null): boolean =>
  priority !== null && bulkGrantSchema.shape.priority.safeParse(priority).success;
