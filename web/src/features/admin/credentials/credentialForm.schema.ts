import { z } from 'zod';
import { dnsLabel } from '@/shared/forms';

/** Longest token the Api accepts (CRED-1). */
export const MAX_TOKEN_LENGTH = 16384;

/** Longest credential description the Api accepts. */
const MAX_DESCRIPTION = 1000;

/**
 * CRED-1 token rules, mirroring the Api: trimmed, required, no internal whitespace, at most 16384 characters. The
 * output is the trimmed token, which is what the request sends. Messages never echo the value (CRED-2).
 */
export const tokenSchema = z
  .string()
  .trim()
  .min(1, 'Token is required.')
  .refine((value) => !/\s/.test(value), { message: 'The token must not contain spaces or line breaks.' })
  .refine((value) => value.length <= MAX_TOKEN_LENGTH, {
    message: `The token must be at most ${MAX_TOKEN_LENGTH} characters.`,
  });

/** Client-side rules of "Add credential" (CRED-1); the Api stays authoritative (its 400s land on the same fields). */
export const addCredentialSchema = z.object({
  name: dnsLabel(63, { requiredMessage: 'Name is required.' }),
  description: z
    .string()
    .trim()
    .max(MAX_DESCRIPTION, `Description must be at most ${MAX_DESCRIPTION} characters.`)
    .transform((value) => (value === '' ? null : value)),
  token: tokenSchema,
});

/** Raw values of the "Add credential" form. */
export type AddCredentialFormInput = z.input<typeof addCredentialSchema>;

/** Validated values; identical to the `AddCredentialRequest` body. */
export type AddCredentialFormValues = z.output<typeof addCredentialSchema>;

/** Defaults of a fresh "Add credential" form (every field needs one, see `applyServerErrors`). */
export const ADD_CREDENTIAL_DEFAULTS: AddCredentialFormInput = { name: '', description: '', token: '' };

/** "Rotate token" form: only the new token; the `version` comes from the credential being rotated. */
export const rotateCredentialSchema = z.object({ token: tokenSchema });

/** Raw values of the "Rotate token" form. */
export type RotateCredentialFormInput = z.input<typeof rotateCredentialSchema>;

/** Validated values of the "Rotate token" form. */
export type RotateCredentialFormValues = z.output<typeof rotateCredentialSchema>;

/** Help text under the token field: how to mint a ServiceAccount token, and that it is never shown again. */
export const TOKEN_HELPER_TEXT = 'Paste the ServiceAccount token. It is stored encrypted and never shown again.';
