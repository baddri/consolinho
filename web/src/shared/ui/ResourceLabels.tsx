import { Label, LabelGroup, type LabelProps } from '@patternfly/react-core';
import type { Ref } from 'react';
import { Link } from 'react-router';
import styles from './ResourceLabels.module.css';

/** Props for {@link ResourceLabels}. */
export interface ResourceLabelsProps {
  /** `metadata.labels` of the object. */
  labels: Readonly<Record<string, string>>;
  /** Label colour, per kind (`kindLabelColor`); default grey. */
  color?: LabelProps['color'];
  /** Router path a `key=value` label links to (e.g. the kind's list filtered by it); plain labels without. */
  linkTo?: (key: string, value: string) => string;
}

/**
 * Kubernetes labels of a details page (OCP `public/components/utils/label-list.tsx` in a `co-editable-label-group`
 * box, `UX.md` §6): filled `key=value` labels in the kind's colour, each a router link, all shown (collapsing only after
 * 20, open by default), inside a thin bordered box. "No labels" in subtle text without any.
 */
export function ResourceLabels({ labels, color, linkTo }: ResourceLabelsProps) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return <div className="pf-v6-u-text-color-subtle">No labels</div>;
  return (
    <div className={styles.box}>
      <LabelGroup numLabels={20} defaultIsOpen aria-label="Labels">
        {entries.map(([key, value]) => (
          <Label
            key={key}
            color={color}
            render={
              linkTo &&
              (({ className, content, componentRef }) => (
                <Link
                  className={className}
                  to={linkTo(key, value)}
                  ref={componentRef as Ref<HTMLAnchorElement>}
                >
                  {content}
                </Link>
              ))
            }
          >
            {key}={value}
          </Label>
        ))}
      </LabelGroup>
    </div>
  );
}
