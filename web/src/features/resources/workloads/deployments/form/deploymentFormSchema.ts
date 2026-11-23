import { z } from 'zod';
import { INT_OR_PERCENT_MESSAGE, isValidBound } from '../deploymentStrategy';

/**
 * Client rules of the Edit Deployment form (FORM-2, FORM-3; OCP `deployment-validation-utils` `validationSchema`): only
 * the fields the form owns. T-0216 extends it with environment variables.
 */
export const deploymentFormSchema = z
  .object({
    /** `spec.strategy.type` (Deployment strategy › Strategy type). */
    strategyType: z.enum(['RollingUpdate', 'Recreate']),
    /** `spec.strategy.rollingUpdate.maxUnavailable` as typed (`25%`, `1`, or blank). */
    maxUnavailable: z.string().trim(),
    /** `spec.strategy.rollingUpdate.maxSurge` as typed. */
    maxSurge: z.string().trim(),
    /** `spec.template.spec.containers[].image` by container name, in the pod template's order (Images › Image Name). */
    images: z.array(z.object({ name: z.string(), image: z.string().trim().min(1, 'Required') })),
    /** `spec.paused` (Advanced options › Pause rollouts). */
    paused: z.boolean(),
    /** `spec.replicas` (Advanced options › Scaling). */
    replicas: z.number().int('Replicas must be an integer.').min(0, 'Replicas must be 0 or more.'),
  })
  .superRefine((values, ctx) => {
    // The bounds only exist for Rolling Update; with Recreate they are hidden and can't block Save.
    if (values.strategyType !== 'RollingUpdate') return;
    for (const field of ['maxUnavailable', 'maxSurge'] as const) {
      const text = values[field];
      if (!isValidBound(text)) {
        ctx.addIssue({ code: 'custom', path: [field], message: INT_OR_PERCENT_MESSAGE });
      }
    }
  });

/** Values of the Edit Deployment form; see {@link deploymentFormSchema}. */
export type DeploymentFormValues = z.infer<typeof deploymentFormSchema>;
