import { Form, PageSection, type FormProps } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import styles from './FormPage.module.css';

/** Props for {@link FlexForm}. */
export interface FlexFormProps {
  children: ReactNode;
  onSubmit: FormProps['onSubmit'];
  'aria-label'?: string;
}

/**
 * The `<form>` of a full-page create/edit page (OCP `form-utils/FlexForm.tsx`, `UX.md` §8): a flex column filling the
 * main area, holding a {@link FormBody} and a sticky {@link FormFooter}. It is PF's `Form`, so body and footer inherit
 * its form variables (group gaps, `ActionGroup` spacing). Validation is the page's (`noValidate`).
 */
export function FlexForm({ children, onSubmit, 'aria-label': ariaLabel }: FlexFormProps) {
  return (
    <Form noValidate className={styles.flexForm} onSubmit={onSubmit} aria-label={ariaLabel}>
      {children}
    </Form>
  );
}

/**
 * Scrolling body of a full-page form (OCP `form-utils/FormBody.tsx`): a filled page section whose form grid is capped
 * like OCP's `.co-m-pane__form` (650px above 768px), so fields never span the whole page.
 */
export function FormBody({ children }: { children: ReactNode }) {
  return (
    <PageSection isFilled hasBodyWrapper={false}>
      <div className={styles.paneForm}>{children}</div>
    </PageSection>
  );
}

/**
 * Sticky footer of a full-page form (OCP `form-utils/FormFooter.tsx`): a bottom-stuck page section with PF's top
 * shadow, server-error/conflict alerts (`children` before the actions) above the `ActionGroup` passed as `actions` —
 * primary Create/Save, then `secondary` Cancel.
 */
export function FormFooter({ children, actions }: { children?: ReactNode; actions: ReactNode }) {
  return (
    <PageSection className={styles.footer} stickyBase="bottom" isStickyStuck>
      <div className={styles.footerContent}>
        {children}
        {actions}
      </div>
    </PageSection>
  );
}
