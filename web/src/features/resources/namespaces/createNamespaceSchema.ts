import { z } from 'zod';
import { dnsLabel } from '@/shared/forms';
import { labelEntryErrors } from '../actions/labelValidation';

/** OCP's Name help (`CreateNamespaceModal.tsx` field-level help), first paragraph of the label help popover. */
export const NAMESPACE_NAME_HELP =
  "A Namespace name must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character (e.g. 'my-name' or '123-abc').";

/** Second paragraph of OCP's Name help popover. */
export const NAMESPACE_NAME_PREFIX_HELP =
  "You must create a Namespace to be able to create projects that begin with 'openshift-', 'kubernetes-', or 'kube-'.";

/**
 * Fields of the Create Namespace modal (NSC-1): a required RFC 1123 label of at most 63 characters and the
 * `key=value` entries of the labels chip input, which must be valid with unique keys. The server still has the last
 * word (taken names, reserved prefixes).
 */
export const createNamespaceSchema = z.object({
  name: dnsLabel(63, { requiredMessage: 'Name is required.' }),
  labels: z.array(z.string()).superRefine((entries, ctx) => {
    for (const [index, message] of labelEntryErrors(entries)) {
      ctx.addIssue({ code: 'custom', path: [index], message });
    }
  }),
});

/** Values of {@link createNamespaceSchema}. */
export type CreateNamespaceValues = z.infer<typeof createNamespaceSchema>;
