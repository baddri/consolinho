import { z } from 'zod';
import { dnsLabel } from '@/shared/forms';

/** Optional "Inspect namespace" (TEST-3): empty = none (`null`), else a DNS label of at most 63 characters. */
export const inspectNamespaceSchema = z
  .string()
  .trim()
  .pipe(dnsLabel(63).or(z.literal('')))
  .transform((value) => (value === '' ? null : value));

/** "Test connection" form: the stored credential to test and the optional namespace to inspect. */
export const testConnectionSchema = z.object({
  credentialId: z.string().min(1, 'Select a credential.'),
  inspectNamespace: inspectNamespaceSchema,
});

/** Raw values of the "Test connection" form. */
export type TestConnectionFormInput = z.input<typeof testConnectionSchema>;

/** Validated values; `inspectNamespace` is the `TestCredentialRequest` body. */
export type TestConnectionFormValues = z.output<typeof testConnectionSchema>;
