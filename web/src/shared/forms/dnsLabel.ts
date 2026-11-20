import { z } from 'zod';

/** RFC 1123 label as used by the contract for cluster, credential and namespace names. */
const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/** Options of {@link dnsLabel}. */
export interface DnsLabelOptions {
  /** Message for an empty value, e.g. "Name is required." (contract §7 style); default "Required.". */
  requiredMessage?: string;
}

/**
 * zod schema of a required DNS label of at most `max` characters (cluster names: 40, credential names and
 * namespaces: 63), with the contract's wording. For an optional label use `dnsLabel(63).or(z.literal(''))`.
 */
export function dnsLabel(max: number, { requiredMessage = 'Required.' }: DnsLabelOptions = {}) {
  const message = `Use lowercase letters, digits and '-' (max ${max}), starting and ending with a letter or digit.`;
  return z.string().min(1, requiredMessage).max(max, message).regex(DNS_LABEL, message);
}
