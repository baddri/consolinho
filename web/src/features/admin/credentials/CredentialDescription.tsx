import styles from './CredentialDescription.module.css';

/**
 * A credential's description in subtle text under its name, clamped to two lines (OCP `.co-line-clamp`); the full
 * text is the hover title and stays in the accessibility tree.
 */
export function CredentialDescription({ description }: { description: string }) {
  return (
    <div className={`pf-v6-u-text-color-subtle ${styles.clamp}`} title={description}>
      {description}
    </div>
  );
}
