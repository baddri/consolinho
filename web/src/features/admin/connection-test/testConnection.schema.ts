import { z } from 'zod';
import { dnsLabel } from '@/shared/forms';

/** Most namespaces one connection test inspects (NST-1), as in the Api. */
export const MAX_INSPECT_NAMESPACES = 10;

/** Label and helper text of the "Inspect namespaces" field, the same in every test entry point (NST-1). */
export const INSPECT_NAMESPACES_LABEL = 'Inspect namespaces';
export const INSPECT_NAMESPACES_HELPER = 'Optional. Up to 10. Lists what the token may do in each namespace.';

const namespaceName = dnsLabel(63);

/** One entry: trimmed, then a DNS label of at most 63 characters; the message names the entry (NST-2). */
const inspectNamespaceEntry = z
  .string()
  .trim()
  .superRefine((value, context) => {
    if (!namespaceName.safeParse(value).success) {
      context.addIssue({ code: 'custom', message: `Not a valid namespace name: ${value}.` });
    }
  });

/**
 * "Inspect namespaces" (NST-1/2): at most 10 namespace names, each trimmed and a DNS label; duplicates are dropped
 * (first wins) so the request carries the entries in the order the admin entered them. `[]` = none.
 */
export const inspectNamespacesSchema = z
  .array(inspectNamespaceEntry)
  .max(MAX_INSPECT_NAMESPACES, 'Up to 10 namespaces.')
  .transform((names) => [...new Set(names)]);

/** "Test connection" form: the stored credential to test and the namespaces to inspect. */
export const testConnectionSchema = z.object({
  credentialId: z.string().min(1, 'Select a credential.'),
  inspectNamespaces: inspectNamespacesSchema,
});

/** Raw values of the "Test connection" form. */
export type TestConnectionFormInput = z.input<typeof testConnectionSchema>;

/** Validated values; `inspectNamespaces` is the `TestCredentialRequest` body. */
export type TestConnectionFormValues = z.output<typeof testConnectionSchema>;
