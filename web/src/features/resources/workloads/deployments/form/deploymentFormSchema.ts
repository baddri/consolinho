import { z } from 'zod';
import type { Deployment } from '@/shared/k8s';
import { INT_OR_PERCENT_MESSAGE, isValidBound } from '../deploymentStrategy';

type PodSpec = NonNullable<NonNullable<Deployment['spec']>['template']['spec']>;
/** One `env` entry of a container. */
export type EnvVar = NonNullable<PodSpec['containers'][number]['env']>[number];

/** Shared by every row: the entry it was read from, so an unchanged row writes back exactly what was there. */
const rowSource = { source: z.custom<EnvVar>().optional() };

/** An `env` entry with a literal `value` ("Add value"); blank name and value is the editor's empty row. */
const valueRow = z.object({ type: z.literal('value'), name: z.string(), value: z.string(), ...rowSource });

/**
 * An `env` entry whose value is one key of a ConfigMap or Secret ("Add from ConfigMap or Secret"). Only the key's name
 * is kept: Secret values never enter the form (CFG-4).
 */
const refRow = z.object({
  type: z.literal('ref'),
  name: z.string(),
  /** Blank until a resource is picked. */
  refKind: z.enum(['ConfigMap', 'Secret', '']),
  refName: z.string(),
  key: z.string(),
  ...rowSource,
});

/** An `env` entry the form shows read-only and writes back as it was (`fieldRef`, `resourceFieldRef`), bar its name. */
const fixedRow = z.object({ type: z.literal('fixed'), name: z.string(), source: z.custom<EnvVar>() });

const REQUIRED = 'Required';

/** One row of the Environment Variables editor (OCP `NameValueEditor` pair). */
const envRow = z.discriminatedUnion('type', [valueRow, refRow, fixedRow]).superRefine((row, ctx) => {
  const isBlank =
    row.type === 'value'
      ? row.name === '' && row.value === ''
      : row.type === 'ref' && row.name === '' && row.refName === '' && row.key === '';
  // Blank rows are dropped on save, so they never block it.
  if (isBlank) return;
  if (row.name.trim() === '') ctx.addIssue({ code: 'custom', path: ['name'], message: REQUIRED });
  if (row.type !== 'ref') return;
  if (row.refName === '') ctx.addIssue({ code: 'custom', path: ['refName'], message: 'Select a resource' });
  else if (row.key === '') ctx.addIssue({ code: 'custom', path: ['key'], message: 'Select a key' });
});

/** One row of the Environment Variables editor; see {@link envRow}. */
export type EnvRow = z.infer<typeof envRow>;

/**
 * Client rules of the Edit Deployment form (FORM-2, FORM-3; OCP `deployment-validation-utils` `validationSchema`): only
 * the fields the form owns.
 */
export const deploymentFormSchema = z
  .object({
    /** `spec.strategy.type` (Deployment strategy › Strategy type). */
    strategyType: z.enum(['RollingUpdate', 'Recreate']),
    /** `spec.strategy.rollingUpdate.maxUnavailable` as typed (`25%`, `1`, or blank). */
    maxUnavailable: z.string().trim(),
    /** `spec.strategy.rollingUpdate.maxSurge` as typed. */
    maxSurge: z.string().trim(),
    /**
     * The pod template's containers in order, written back by name: `image` (Images › Image Name) and `env`
     * (Environment Variables; `envFrom` is not edited).
     */
    containers: z.array(
      z.object({ name: z.string(), image: z.string().trim().min(1, REQUIRED), env: z.array(envRow) }),
    ),
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
