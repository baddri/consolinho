import { z } from 'zod';

/** API copy of GRP-2: priority missing or outside 1–1000. */
export const PRIORITY_RANGE_MESSAGE = 'Priority must be between 1 and 1000.';

/** Characters a group name may not contain (GRP-6): `/`, `%`, `:` and control characters. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what the rule rejects
const FORBIDDEN_GROUP_CHARS = /[/%:\u0000-\u001f\u007f]/;

/**
 * Client check of a group name mirroring the Api's validator (GRP-3 first, then GRP-6); `undefined` when valid. The
 * name is checked trimmed, as the Api trims it.
 */
export function groupNameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.toLowerCase().startsWith('system:')) return "System groups can't be granted access.";
  const isValid =
    trimmed.length >= 1 &&
    trimmed.length <= 253 &&
    trimmed !== '.' &&
    trimmed !== '..' &&
    !FORBIDDEN_GROUP_CHARS.test(trimmed);
  return isValid ? undefined : 'Enter a valid group name.';
}

/**
 * Client-side rules of the grant dialog (GRANT-2/3, UIG-1/3); the Api stays authoritative. `target` is the subject
 * name: a user picked from FleetConsole users, or a group (listed or typed). The server's `username` / `groupName`
 * errors are mapped onto it (`fieldMap`). In edit mode kind and name are fixed. `priority` is `null` (not `undefined`)
 * when empty so a server error on it still lands on the field (`applyServerErrors` needs a leaf value); groups
 * require it, users never send it.
 */
export function grantFormSchema() {
  return z
    .object({
      subjectKind: z.enum(['user', 'group']),
      target: z.string(),
      priority: z
        .number()
        .int(PRIORITY_RANGE_MESSAGE)
        .min(1, PRIORITY_RANGE_MESSAGE)
        .max(1000, PRIORITY_RANGE_MESSAGE)
        .nullable(),
      credentialId: z.string().min(1, 'Select a credential.'),
      accessMode: z.enum(['readOnly', 'readWrite']),
      // Edit only: the version the shown values are based on. Changed only by opening the dialog or "Reload latest
      // values" (`form.reset`), never by a background refetch, so a stale save stays a 409 (ADM-4). Unused on create.
      version: z.number(),
    })
    .superRefine((values, ctx) => {
      if (values.subjectKind === 'user') {
        if (values.target === '') {
          ctx.addIssue({ code: 'custom', path: ['target'], message: 'Select a user.' });
        }
        return;
      }
      const nameError = values.target.trim() === '' ? 'Enter a group name.' : groupNameError(values.target);
      if (nameError) ctx.addIssue({ code: 'custom', path: ['target'], message: nameError });
      if (values.priority === null) {
        ctx.addIssue({ code: 'custom', path: ['priority'], message: PRIORITY_RANGE_MESSAGE });
      }
    });
}

/** Values of the grant dialog. */
export type GrantFormValues = z.infer<ReturnType<typeof grantFormSchema>>;
