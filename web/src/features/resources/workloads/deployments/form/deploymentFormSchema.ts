import { z } from 'zod';

/**
 * Client rules of the Edit Deployment form (FORM-3, OCP `deployment-utils` `validationSchema`): only the fields the
 * form owns. T-0215/T-0216 extend it with strategy, images and environment variables.
 */
export const deploymentFormSchema = z.object({
  /** `spec.paused` (Advanced options › Pause rollouts). */
  paused: z.boolean(),
  /** `spec.replicas` (Advanced options › Scaling). */
  replicas: z.number().int('Replicas must be an integer.').min(0, 'Replicas must be 0 or more.'),
});

/** Values of the Edit Deployment form; see {@link deploymentFormSchema}. */
export type DeploymentFormValues = z.infer<typeof deploymentFormSchema>;
