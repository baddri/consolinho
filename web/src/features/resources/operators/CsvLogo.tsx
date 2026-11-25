import { CubesIcon } from '@patternfly/react-icons';
import { csvIconSrc, type CsvResource } from './csv';
import styles from './CsvLogo.module.css';

/**
 * The operator's icon on a white tile (OCP `ClusterServiceVersionHeaderIcon`): the CSV's own icon only as a `data:`
 * URI ({@link csvIconSrc}), else a placeholder. Presentational — the name sits next to it, so `alt` is empty.
 */
export function CsvIcon({ csv }: { csv: CsvResource }) {
  const src = csvIconSrc(csv);
  return (
    <span className={styles.icon}>
      <span className={styles.iconBg}>
        {src ? (
          <img className={styles.img} src={src} alt="" />
        ) : (
          <CubesIcon className={styles.placeholder} aria-hidden data-testid="csv-icon-placeholder" />
        )}
      </span>
    </span>
  );
}

/**
 * Icon, display name and "<version> provided by <provider>" (OCP `ClusterServiceVersionLogo`), the Installed Operators
 * name cell. OCP's name is an `h1`; a styled span here, as a table cell holds no headings.
 */
export function CsvLogo({ csv }: { csv: CsvResource }) {
  const { displayName, version, provider } = csv.spec ?? {};
  return (
    <span className={styles.logo}>
      <CsvIcon csv={csv} />
      <span className={styles.name}>
        <span className={styles.displayName}>{displayName ?? csv.metadata.name}</span>
        {provider?.name && (
          <span className="pf-v6-u-font-size-xs pf-v6-u-text-color-subtle">
            {`${version ?? ''} provided by ${provider.name}`}
          </span>
        )}
      </span>
    </span>
  );
}

/** {@link CsvLogo} class names the name cell's link needs (OCP `co-clusterserviceversion-link`). */
export const csvLinkClassName = styles.link;
