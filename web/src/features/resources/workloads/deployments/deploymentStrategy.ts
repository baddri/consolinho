import type { Deployment } from '@/shared/k8s';

/** OCP's default (and placeholder) for both rolling-update bounds. */
export const DEFAULT_BOUND = '25%';
/** A whole number of pods or a whole percentage; blank means OCP's 25% default. */
export const INT_OR_PERCENT = /^\d+%?$/;
/** The field error for a bound that fails {@link INT_OR_PERCENT}. */
export const INT_OR_PERCENT_MESSAGE = 'Enter a whole number of pods or a percentage, e.g. 25%.';

/** `spec.strategy.type` values a Deployment supports. */
export type DeploymentStrategyType = 'RollingUpdate' | 'Recreate';
/** A Deployment's `spec.strategy`. */
export type DeploymentStrategy = NonNullable<NonNullable<Deployment['spec']>['strategy']>;
type IntOrString = NonNullable<NonNullable<DeploymentStrategy['rollingUpdate']>['maxSurge']>;

/** The strategy as typed into a form: the type and both bounds as text. */
export interface StrategyInput {
  type: DeploymentStrategyType;
  maxUnavailable: string;
  maxSurge: string;
}

/** A validated bound as the API wants it: `25%` stays a string, `1` becomes a number; blank is OCP's 25%. */
function toIntOrPercent(text: string): IntOrString {
  const value = text === '' ? DEFAULT_BOUND : text;
  return value.endsWith('%') ? value : Number(value);
}

/**
 * The `spec.strategy` to write, shared by the update-strategy modal and the Edit Deployment form: Recreate carries no
 * `rollingUpdate` (the API rejects it there).
 */
export function toDeploymentStrategy({ type, maxUnavailable, maxSurge }: StrategyInput): DeploymentStrategy {
  return type === 'Recreate'
    ? { type }
    : {
        type,
        rollingUpdate: { maxUnavailable: toIntOrPercent(maxUnavailable), maxSurge: toIntOrPercent(maxSurge) },
      };
}

/** Whether a typed bound is acceptable: blank (OCP's 25%) or {@link INT_OR_PERCENT}. */
export const isValidBound = (text: string): boolean => text === '' || INT_OR_PERCENT.test(text);
