import {
  Breadcrumb,
  BreadcrumbItem,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListTermHelpText,
  DescriptionListTermHelpTextButton,
  Grid,
  GridItem,
  Panel,
  PanelMain,
  Popover,
} from '@patternfly/react-core';
import { useContext, type ReactNode } from 'react';
import styles from './DetailsGrid.module.css';
import { FieldHelpContext } from './FieldHelpContext';

/**
 * Two-column details layout (OCP `ResourceSummary` + `DetailsItem`, `UX.md` §6): put two {@link DetailsColumn}s
 * inside; they sit side by side from `sm` (576 px) and stack below.
 */
export function DetailsGrid({ children }: { children: ReactNode }) {
  return <Grid hasGutter>{children}</Grid>;
}

/** Props for {@link DetailsColumn}. */
export interface DetailsColumnProps {
  children: ReactNode;
  /** Accessible name of the list, e.g. "Metadata", so the two halves can be told apart. */
  'aria-label'?: string;
}

/** One half of a {@link DetailsGrid}: a vertical `DescriptionList` (term above value, never horizontal). */
export function DetailsColumn({ children, 'aria-label': ariaLabel }: DetailsColumnProps) {
  return (
    <GridItem sm={6}>
      <DescriptionList aria-label={ariaLabel}>{children}</DescriptionList>
    </GridItem>
  );
}

/** Props for {@link DetailsItem}. */
export interface DetailsItemProps {
  label: string;
  /**
   * OCP-style dotted schema path of the shown field (`spec.replicas`, `metadata.labels`). With a
   * {@link FieldHelpContext} that describes it, the term becomes a popover button with the field's description.
   */
  path?: string;
  children: ReactNode;
  'data-testid'?: string;
}

/** OCP `PropertyPath`: `Kind › spec › replicas`, the last segment active. */
function PropertyPath({ kind, path }: { kind: string; path: string }) {
  const segments = path.split('.');
  return (
    <Breadcrumb>
      <BreadcrumbItem>{kind}</BreadcrumbItem>
      {segments.map((segment, i) => (
        // Segments may repeat (`spec.template.spec`), so the position is the key.
        <BreadcrumbItem key={i} isActive={i === segments.length - 1}>
          {segment}
        </BreadcrumbItem>
      ))}
    </Breadcrumb>
  );
}

/**
 * One term/value pair of a {@link DetailsColumn} (OCP `DetailsItem`). When `path` is set and the surrounding
 * {@link FieldHelpContext} has a description for it, the term is OCP's dashed-underline help text opening a popover
 * (label, scrollable description, path breadcrumb); otherwise it is a plain term.
 */
export function DetailsItem({ label, path, children, 'data-testid': testId }: DetailsItemProps) {
  const help = useContext(FieldHelpContext);
  const description = path === undefined ? undefined : help?.describe(path);
  return (
    <DescriptionListGroup data-testid={testId}>
      {help && path !== undefined && description ? (
        <DescriptionListTermHelpText>
          <Popover
            headerContent={label}
            bodyContent={
              <Panel isScrollable hasNoBorder>
                <PanelMain maxHeight="min(30rem, 50vh)" role="region" aria-label={label}>
                  <div className={styles.description}>{description}</div>
                </PanelMain>
              </Panel>
            }
            footerContent={<PropertyPath kind={help.kindLabel} path={path} />}
            maxWidth="30rem"
          >
            <DescriptionListTermHelpTextButton>{label}</DescriptionListTermHelpTextButton>
          </Popover>
        </DescriptionListTermHelpText>
      ) : (
        <DescriptionListTerm>{label}</DescriptionListTerm>
      )}
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  );
}
