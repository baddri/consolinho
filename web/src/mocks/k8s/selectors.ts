import type { K8sResource } from '@/shared/k8s';

/** A parsed selector: `undefined` when the selector string is malformed (→ 400 `BadRequest`). */
export type ObjectPredicate = (object: K8sResource) => boolean;

/** Splits on commas outside parentheses (`app in (a,b),tier=web`). */
function splitTerms(selector: string): string[] {
  const terms: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of selector) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      terms.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  terms.push(current.trim());
  return terms.filter((term) => term !== '');
}

type LabelTerm = (labels: Record<string, string>) => boolean;

const SET_TERM = /^([\w./-]+)\s+(in|notin)\s+\(([^)]*)\)$/;
const EQUALITY_TERM = /^([\w./-]+)\s*(==|=|!=)\s*([\w.-]*)$/;
const EXISTS_TERM = /^(!?)([\w./-]+)$/;

function parseLabelTerm(term: string): LabelTerm | undefined {
  const set = SET_TERM.exec(term);
  if (set) {
    const [, key = '', op, rawValues = ''] = set;
    const values = new Set(rawValues.split(',').map((value) => value.trim()));
    return op === 'in'
      ? (labels) => key in labels && values.has(labels[key] ?? '')
      : (labels) => !(key in labels) || !values.has(labels[key] ?? '');
  }
  const equality = EQUALITY_TERM.exec(term);
  if (equality) {
    const [, key = '', op, value] = equality;
    return op === '!=' ? (labels) => labels[key] !== value : (labels) => labels[key] === value;
  }
  const exists = EXISTS_TERM.exec(term);
  if (exists) {
    const [, negated, key = ''] = exists;
    return negated ? (labels) => !(key in labels) : (labels) => key in labels;
  }
  return undefined;
}

/**
 * Parses a Kubernetes label selector (`=`, `==`, `!=`, `in`, `notin`, `key`, `!key`; terms ANDed). Returns
 * `undefined` for syntax the API server would reject.
 */
export function parseLabelSelector(selector: string | null): ObjectPredicate | undefined {
  if (!selector) return () => true;
  const terms = splitTerms(selector).map(parseLabelTerm);
  if (terms.some((term) => term === undefined)) return undefined;
  return (object) => {
    const labels = object.metadata.labels ?? {};
    return terms.every((term) => term?.(labels) ?? false);
  };
}

/** Value of a dotted field path (`involvedObject.uid`) as a string, `''` when absent (like the API server). */
function fieldValue(object: K8sResource, path: string): string {
  let current: unknown = object;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' || typeof current === 'number' ? String(current) : '';
}

const FIELD_TERM = /^([\w.]+)\s*(==|=|!=)\s*(.*)$/;

/**
 * Parses a field selector (`metadata.name=web`, `involvedObject.uid=…`, `!=`; terms ANDed). Any dotted path is
 * accepted; the real API server supports only a few per kind, but the console uses only supported ones.
 */
export function parseFieldSelector(selector: string | null): ObjectPredicate | undefined {
  if (!selector) return () => true;
  const terms = splitTerms(selector).map((term) => FIELD_TERM.exec(term));
  if (terms.some((term) => term === null)) return undefined;
  return (object) =>
    terms.every((term) => {
      const [, path = '', op, value = ''] = term ?? [];
      const matches = fieldValue(object, path) === value;
      return op === '!=' ? !matches : matches;
    });
}
