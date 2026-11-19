import { z } from 'zod';

/** Usernames OpenShift can never report (USR-2); the Api refuses them too. */
const RESERVED_USERNAMES: readonly string[] = ['.', '..', '~'];

/** `/`, `%`, whitespace or a control character anywhere in the username (USR-2). */
// eslint-disable-next-line no-control-regex -- control characters are exactly what USR-2 forbids
const FORBIDDEN_USERNAME_CHARS = /[/%\s\u0000-\u001f\u007f]/;

/**
 * Client-side rules of the "Add user" form (USR-2), mirroring the Api's `CreateUserRequest` validation so most
 * mistakes are caught before the request; the server stays authoritative (its 400s land on the same fields).
 * The username is not trimmed: OpenShift usernames are exact and case-sensitive.
 */
export const createUserSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required.')
    .max(253, 'Username must be at most 253 characters.')
    .refine((value) => !FORBIDDEN_USERNAME_CHARS.test(value), {
      message: "Username can't contain '/', '%', whitespace or control characters.",
    })
    .refine((value) => !RESERVED_USERNAMES.includes(value), { message: "Username can't be '.', '..' or '~'." }),
  role: z.enum(['user', 'admin']),
  isReadOnly: z.boolean(),
});

/** Values of the "Add user" form; identical to the `CreateUserRequest` body. */
export type CreateUserFormValues = z.infer<typeof createUserSchema>;

/** Defaults of a fresh "Add user" form (every field needs one, see `applyServerErrors`). */
export const CREATE_USER_DEFAULTS: CreateUserFormValues = { username: '', role: 'user', isReadOnly: false };
