import { z } from 'zod';
import { dnsLabel } from '@/shared/forms';

/** OCP's Name help (`CreateProjectModal.tsx` field-level help), first sentence of the label help popover. */
export const PROJECT_NAME_HELP =
  "A Project name must consist of lower case alphanumeric characters or '-', and must start and end with an alphanumeric character (e.g. 'my-name' or '123-abc').";

/** Second sentence of OCP's Name help popover. */
export const PROJECT_NAME_PREFIX_HELP =
  "You must create a Namespace to be able to create projects that begin with 'openshift-', 'kubernetes-', or 'kube-'.";

/**
 * Fields of the Create Project modal: a required RFC 1123 label of at most 63 characters (a namespace name), plus an
 * optional display name and description that become the project's annotations. The server still has the last word
 * (e.g. reserved `openshift-` prefixes, taken names).
 */
export const createProjectSchema = z.object({
  name: dnsLabel(63, { requiredMessage: 'Name is required.' }),
  displayName: z.string(),
  description: z.string(),
});

/** Values of {@link createProjectSchema}. */
export type CreateProjectValues = z.infer<typeof createProjectSchema>;
