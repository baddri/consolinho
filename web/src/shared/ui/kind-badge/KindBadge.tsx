import styles from './KindBadge.module.css';

/** Kind → colour class, as OCP `_resource.scss` (`co-m-resource-<kind>`); other kinds keep the default colour. */
const KIND_CLASSES: Readonly<Record<string, string | undefined>> = {
  Pod: styles.pod,
  Deployment: styles.workload,
  DeploymentConfig: styles.workload,
  ReplicaSet: styles.workload,
  ReplicationController: styles.workload,
  StatefulSet: styles.workload,
  DaemonSet: styles.workload,
  Job: styles.workload,
  Namespace: styles.namespace,
  Project: styles.namespace,
  ConfigMap: styles.configmap,
  Secret: styles.secret,
  Service: styles.service,
};

/** OCP's abbreviation rule (`kindToAbbr`): the capitals of the kind, e.g. `ConfigMap` → `CM`. */
export function kindAbbr(kind: string): string {
  return (kind.replace(/[^A-Z]/g, '') || kind.toUpperCase()).slice(0, 4);
}

/** Props for {@link KindBadge}. */
export interface KindBadgeProps {
  /** Kind name (`Pod`, `ConfigMap`); picks the colour and is the hover title. */
  kind: string;
  /** Badge text; defaults to {@link kindAbbr} of the kind. */
  abbr?: string;
  /** `lg` before a details-page title (`co-m-resource-icon--lg`). */
  size?: 'md' | 'lg';
}

/**
 * OCP kind badge (`ResourceIcon`, `co-m-resource-icon`, `UX.md` §5): a filled pill coloured per kind before resource
 * names and details titles. The pill itself is hidden from assistive technology; as in OCP, a screen-reader-only kind
 * name precedes it, so a title or link reads "Deployment web". The kind is also the pill's hover title.
 */
export function KindBadge({ kind, abbr, size = 'md' }: KindBadgeProps) {
  const classes = [styles.badge, KIND_CLASSES[kind], size === 'lg' ? styles.lg : undefined]
    .filter(Boolean)
    .join(' ');
  return (
    <>
      <span className="pf-v6-u-screen-reader">{kind}</span>
      {/* So the accessible name reads "Deployment web", not "Deploymentweb". Invisible: the screen-reader span is out of
          flow, so this space starts the line (collapsed) or is a whitespace-only flex item (dropped). */}{' '}
      <span className={classes} title={kind} aria-hidden="true">
        {abbr ?? kindAbbr(kind)}
      </span>
    </>
  );
}
