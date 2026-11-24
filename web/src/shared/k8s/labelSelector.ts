import type { LabelSelector, LabelSelectorRequirement } from 'kubernetes-types/meta/v1';

export type { LabelSelector, LabelSelectorRequirement };

/** One `matchExpressions` requirement in label-selector syntax (OCP `requirementToString`); `''` for an unknown operator. */
function requirementString({ key, operator, values = [] }: LabelSelectorRequirement): string {
  switch (operator) {
    case 'In':
      return `${key} in (${values.join(',')})`;
    case 'NotIn':
      return `${key} notin (${values.join(',')})`;
    case 'Exists':
      return key;
    case 'DoesNotExist':
      return `!${key}`;
    default:
      return '';
  }
}

/**
 * A `LabelSelector` as a `labelSelector=` query string (OCP `selectorToString`): `matchLabels` as `key=value`, then
 * `matchExpressions` as `key in (a,b)`, `key notin (a,b)`, `key`, `!key`; terms ANDed with `,`. `''` without terms,
 * which the API server reads as "everything", so callers that must not list everything check for `undefined` first.
 * `matchLabels` keep their object order (OCP sorts the keys) so existing query strings stay byte-identical.
 */
export function labelSelectorString(selector: LabelSelector | undefined): string {
  const labels = Object.entries(selector?.matchLabels ?? {}).map(([key, value]) => `${key}=${value}`);
  const expressions = (selector?.matchExpressions ?? []).map(requirementString);
  return [...labels, ...expressions].filter((term) => term !== '').join(',');
}
