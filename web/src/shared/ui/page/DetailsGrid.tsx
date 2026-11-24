import {
  Breadcrumb,
  Button,
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
  Split,
  SplitItem,
} from '@patternfly/react-core';
import { ExternalLinkButton } from '@patternfly/react-component-groups';
import { RhUiEditIcon } from '@patternfly/react-icons';
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
  /**
   * OCP `onEdit` + `canEdit` + `editAsGroup` (Labels): when set, the term gets an inline "Edit" link button at its
   * right end. Leave unset without write access.
   */
  onEdit?: () => void;
  'data-testid'?: string;
}

/** OCP `InlineEditButton`: an inline link button with the edit icon at its end. */
export function InlineEditButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="link" isInline icon={<RhUiEditIcon />} iconPosition="end" onClick={onClick}>
      {children}
    </Button>
  );
}

/** `http(s)` URLs in prose; trailing sentence punctuation is not part of the URL. */
const URL_PATTERN = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/g;

/**
 * OCP `LinkifyExternal` for plain-text schema descriptions ("More info: https://…"): each URL becomes an inline
 * external link (new tab, external-link icon); the rest stays text, so the `pre-line` wrapper keeps its line breaks.
 */
function LinkifiedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0];
    parts.push(
      text.slice(last, match.index),
      <ExternalLinkButton key={match.index} variant="link" isInline href={url}>
        {url}
      </ExternalLinkButton>,
    );
    last = match.index + url.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
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
 * (label, scrollable description with its URLs as external links, path breadcrumb); otherwise it is a plain term.
 * With `onEdit` the term also carries OCP's inline "Edit" button.
 */
export function DetailsItem({ label, path, children, onEdit, 'data-testid': testId }: DetailsItemProps) {
  const help = useContext(FieldHelpContext);
  const description = path === undefined ? undefined : help?.describe(path);
  const helpTerm =
    help && path !== undefined && description ? (
      <Popover
        headerContent={label}
        bodyContent={
          <Panel isScrollable hasNoBorder>
            <PanelMain maxHeight="min(30rem, 50vh)" role="region" aria-label={label}>
              <div className={styles.description}>
                <LinkifiedText text={description} />
              </div>
            </PanelMain>
          </Panel>
        }
        footerContent={<PropertyPath kind={help.kindLabel} path={path} />}
        maxWidth="30rem"
      >
        <DescriptionListTermHelpTextButton>{label}</DescriptionListTermHelpTextButton>
      </Popover>
    ) : undefined;
  let term: ReactNode;
  if (onEdit) {
    // OCP `DetailsItem` `editAsGroup`: a full-width split, the (help) label filling it and "Edit" at the right.
    term = (
      <DescriptionListTermHelpText>
        <Split className="pf-v6-u-w-100">
          <SplitItem isFilled>{helpTerm ?? label}</SplitItem>
          <SplitItem>
            <InlineEditButton onClick={onEdit}>Edit</InlineEditButton>
          </SplitItem>
        </Split>
      </DescriptionListTermHelpText>
    );
  } else {
    term = helpTerm ? (
      <DescriptionListTermHelpText>{helpTerm}</DescriptionListTermHelpText>
    ) : (
      <DescriptionListTerm>{label}</DescriptionListTerm>
    );
  }
  return (
    <DescriptionListGroup data-testid={testId}>
      {term}
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  );
}
