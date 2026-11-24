import type { Ingress } from '@/shared/k8s';

/** The annotation older Ingresses use instead of `spec.ingressClassName`. */
const INGRESS_CLASS_ANNOTATION = 'kubernetes.io/ingress.class';

/** One row of the Ingress rules table: a path of a rule, or the default backend of a rule without paths. */
export interface IngressRuleRow {
  /** `rules[].host`, `*` when the rule matches every host. */
  host: string;
  /** True when `host` is listed in a `spec.tls[].hosts` entry, so it is served over https. */
  tls: boolean;
  /** `paths[].path`, `*` without one (networking-plugin `RulesRows`). */
  path: string;
  pathType?: string;
  serviceName?: string;
  /** The backend Service port: its `number`, else its `name`. */
  servicePort?: number | string;
}

/** The hosts of `ingress`'s rules, in order, skipping rules without one (networking-plugin `ingressValidHosts`). */
export function ingressHosts(ingress: Ingress): string[] {
  return (ingress.spec?.rules ?? []).flatMap((rule) => (rule.host ? [rule.host] : []));
}


/** `spec.ingressClassName`, else the legacy `kubernetes.io/ingress.class` annotation. */
export function ingressClass(ingress: Ingress): string | undefined {
  return ingress.spec?.ingressClassName ?? ingress.metadata?.annotations?.[INGRESS_CLASS_ANNOTATION];
}

/** The hostnames or IPs the load balancer reports in `status.loadBalancer.ingress`. */
export function loadBalancerAddresses(ingress: Ingress): string[] {
  return (ingress.status?.loadBalancer?.ingress ?? []).flatMap((entry) => {
    const address = entry.hostname ?? entry.ip;
    return address ? [address] : [];
  });
}

/**
 * True when a `spec.tls[].hosts` entry covers `host`: the same name, or a `*.` wildcard matching exactly one leading
 * label (`*.example.com` covers `a.example.com`, not `a.b.example.com`).
 */
function coveredByTls(host: string, tlsHosts: readonly string[]): boolean {
  return tlsHosts.some((tlsHost) => {
    if (tlsHost === host) return true;
    if (!tlsHost.startsWith('*.')) return false;
    const dot = host.indexOf('.');
    return dot > 0 && host.slice(dot) === tlsHost.slice(1);
  });
}

/** `value`, or `*` when it is absent or empty (networking-plugin `RulesRows`). */
function orAny(value: string | undefined): string {
  return value === undefined || value === '' ? '*' : value;
}

/** The Service port of a backend: `number` when set, else `name` (networking-plugin `getPort`). */
function backendPort(port: { number?: number; name?: string } | undefined): number | string | undefined {
  return port?.number ?? port?.name;
}

/**
 * The rows of the Ingress rules table (networking-plugin `RulesRows`): one per `rules[].http.paths[]`, a rule without
 * paths routes `*` to `spec.defaultBackend`. With no rules at all, a lone default backend gets a `*`/`*` row.
 */
export function ingressRuleRows(ingress: Ingress): IngressRuleRow[] {
  const spec = ingress.spec ?? {};
  const tlsHosts = (spec.tls ?? []).flatMap((tls) => tls.hosts ?? []);
  const fallback = spec.defaultBackend?.service;
  const defaultRow = (host: string): IngressRuleRow => ({
    host,
    tls: coveredByTls(host, tlsHosts),
    path: '*',
    serviceName: fallback?.name,
    servicePort: backendPort(fallback?.port),
  });
  const rules = spec.rules ?? [];
  if (rules.length === 0) return fallback ? [defaultRow('*')] : [];
  return rules.flatMap((rule) => {
    const host = orAny(rule.host);
    const paths = rule.http?.paths ?? [];
    if (paths.length === 0) return [defaultRow(host)];
    return paths.map((path) => ({
      host,
      tls: coveredByTls(host, tlsHosts),
      path: orAny(path.path),
      pathType: path.pathType,
      serviceName: path.backend.service?.name,
      servicePort: backendPort(path.backend.service?.port),
    }));
  });
}
