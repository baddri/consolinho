/** One DNS-1123 label: lowercase alphanumerics and `-`, not starting or ending with `-`, at most 63 characters. */
const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** Maximum length of a DNS-1123 subdomain. */
const MAX_HOST_LENGTH = 253;

/** Whitespace, ASCII control characters and DEL (`\s` covers the Unicode spaces). */
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const UNSAFE_PATH_CHARS = /[\s\u0000-\u001f\u007f\\]/;

/** True when `host` is a DNS-1123 subdomain: dot-joined {@link DNS_LABEL}s, ≤ 253 chars (no `*`, no trailing dot). */
function isDnsSubdomain(host: string): boolean {
  return host.length > 0 && host.length <= MAX_HOST_LENGTH && host.split('.').every((label) => DNS_LABEL.test(label));
}

/** True when `path` is absent/empty, or absolute without `//`, backslashes, whitespace or control characters. */
function isSafePath(path: string | undefined): boolean {
  if (path === undefined || path === '') return true;
  return path.startsWith('/') && !path.includes('//') && !UNSAFE_PATH_CHARS.test(path);
}

/** Input of {@link hostUrl}: a cluster-supplied host and path, and whether the endpoint is served over TLS. */
export interface HostUrlInput {
  host?: string;
  path?: string;
  tls: boolean;
}

/**
 * The `href` for a host a cluster object (Route, Ingress) says it is served at — the only place such a value becomes a
 * link (RT-2). Returns `http(s)://<host><path>` only when `host` is a DNS-1123 subdomain and `path` is a plain absolute
 * path, else `undefined` so callers render text. Validation is by allow-list on the raw strings, never by parsing with
 * `new URL` (which accepts `javascript:`, userinfo and other tricks).
 */
export function hostUrl({ host, path, tls }: HostUrlInput): string | undefined {
  if (host === undefined || !isDnsSubdomain(host) || !isSafePath(path)) return undefined;
  return `${tls ? 'https' : 'http'}://${host}${path ?? ''}`;
}
