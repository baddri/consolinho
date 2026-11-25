import {
  ActionList,
  ActionListGroup,
  ActionListItem,
  Breadcrumb,
  BreadcrumbItem,
  Content,
  Divider,
  Flex,
  FlexItem,
  PageSection,
  Title,
} from '@patternfly/react-core';
import { useContext, type ReactNode } from 'react';
import { Link } from 'react-router';
import { HeadingFavoriteContext } from './headingFavorite';
import styles from './PageHeading.module.css';

/** One breadcrumb step; a crumb without `to` is the current page (rendered last, `isActive`). */
export interface BreadcrumbCrumb {
  label: string;
  to?: string;
}

/** Props for {@link PageHeading}; names mirror component-groups `PageHeader` (ADR-0031) plus OCP's extra slots. */
export interface PageHeadingProps {
  /** Page title, rendered as the page's only `h1`. */
  title: ReactNode;
  /** Details pages only (`UX.md` §3): `<Plural> › <Kind> details`. */
  breadcrumbs?: BreadcrumbCrumb[];
  /** Inside the h1 before the title (OCP `co-resource-item`), e.g. the feature's kind badge; shared code never knows kinds. */
  icon?: ReactNode;
  /**
   * Left of the whole title block, behind a vertical divider (component-groups `PageHeader` `icon`), e.g. an
   * operator's logo on its details page; the breadcrumb stays above it. With it the title block takes OCP's logo
   * heading type scale (`ClusterServiceVersionLogo` in `co-page-heading`): 15px name, 600-weight caption, 8px margins.
   */
  leadIcon?: ReactNode;
  /**
   * A small subtle line right under the h1 and outside it, so the heading's name stays the title alone (OCP
   * `ClusterServiceVersionHeaderTitle`'s "<version> provided by <provider>").
   */
  titleCaption?: ReactNode;
  /** Right of the title, e.g. `StatusIconText asLabel`. */
  status?: ReactNode;
  /** Category labels after the status (environment, Read only…). */
  labels?: ReactNode;
  /** Help text under the title row. */
  subtitle?: ReactNode;
  /** Right-aligned actions (primary button or `Actions` dropdown); wraps below the title on narrow widths. */
  actions?: ReactNode;
  /** Optional alert below everything else. */
  alert?: ReactNode;
  /** Hides the favourite star (OCP `hideFavoriteButton`), e.g. on pages that cannot be revisited by URL. */
  hideFavorite?: boolean;
}

/**
 * Router-link breadcrumb; the current crumb is plain text with `aria-current="page"`. Items are direct `BreadcrumbItem` children with no conditional gaps, because `Breadcrumb`
 * draws dividers by child index.
 */
function HeadingBreadcrumb({ crumbs }: { crumbs: BreadcrumbCrumb[] }) {
  return (
    <Breadcrumb>
      {crumbs.map(({ label, to }, index) =>
        to === undefined ? (
          // Plain `isActive` children get no `aria-current`; `render` receives it with the current-crumb class.
          <BreadcrumbItem
            key={`${index}-${label}`}
            isActive
            render={({ className, ariaCurrent }) => (
              <span className={className} aria-current={ariaCurrent}>
                {label}
              </span>
            )}
          />
        ) : (
          <BreadcrumbItem
            key={`${index}-${label}`}
            render={({ className }) => (
              <Link className={className} to={to}>
                {label}
              </Link>
            )}
          />
        ),
      )}
    </Breadcrumb>
  );
}

/**
 * OCP page heading (`console-shared/.../heading/PageHeading.tsx`, `UX.md` §3): breadcrumb → one top-aligned row with
 * h1 ([icon] title) + status + labels on the left and, on the right, an `ActionList` with the favourite star (when the app
 * provides {@link HeadingFavoriteContext}) followed by the actions (wrapping below, never overlapping) → subtitle 8px
 * below the h1 → alert; an optional `leadIcon` sits left of all but the breadcrumb, behind a divider. Every page renders
 * exactly one.
 */
export function PageHeading({
  title,
  breadcrumbs,
  icon,
  leadIcon,
  titleCaption,
  status,
  labels,
  subtitle,
  actions,
  alert,
  hideFavorite = false,
}: PageHeadingProps) {
  const renderFavorite = useContext(HeadingFavoriteContext);
  const favorite =
    renderFavorite && !hideFavorite
      ? renderFavorite({ defaultName: typeof title === 'string' ? title : undefined })
      : undefined;
  const hasActionList = Boolean(favorite) || Boolean(actions);
  // Title row + subtitle without a gap: like OCP's `PageHeader`, the h1 carries `pf-v6-u-mb-sm` when a subtitle
  // follows, so the subtitle sits 8px under the h1 (or right under a taller action).
  const titleBlock = (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapNone' }}>
      {/* Top-aligned like OCP's `Split`: the h1 top lines up with the star/actions top. */}
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsFlexStart' }}
        flexWrap={{ default: 'wrap' }}
        gap={{ default: 'gapMd' }}
      >
        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          flexWrap={{ default: 'wrap' }}
          gap={{ default: 'gapSm' }}
        >
          <FlexItem className={leadIcon ? styles.logoName : undefined}>
            <Title
              headingLevel="h1"
              className={
                [
                  icon ? styles.title : undefined,
                  leadIcon ? styles.logoTitle : undefined,
                  subtitle ? 'pf-v6-u-mb-sm' : undefined,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            >
              {icon}
              {title}
            </Title>
            {titleCaption && (
              <div
                className={`pf-v6-u-font-size-xs pf-v6-u-text-color-subtle${leadIcon ? ` ${styles.logoCaption}` : ''}`}
              >
                {titleCaption}
              </div>
            )}
          </FlexItem>
          {status && <FlexItem className={styles.status}>{status}</FlexItem>}
          {labels && <FlexItem>{labels}</FlexItem>}
        </Flex>
        {hasActionList && (
          <FlexItem>
            <ActionList>
              <ActionListGroup>
                {favorite && <ActionListItem>{favorite}</ActionListItem>}
                {actions && <ActionListItem>{actions}</ActionListItem>}
              </ActionListGroup>
            </ActionList>
          </FlexItem>
        )}
      </Flex>
      {subtitle && (
        <FlexItem>
          <Content component="p">{subtitle}</Content>
        </FlexItem>
      )}
    </Flex>
  );
  return (
    <PageSection hasBodyWrapper={false}>
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <FlexItem>
            <HeadingBreadcrumb crumbs={breadcrumbs} />
          </FlexItem>
        )}
        {leadIcon ? (
          <Flex flexWrap={{ default: 'nowrap' }}>
            <FlexItem alignSelf={{ default: 'alignSelfCenter' }} className={styles.leadIcon}>
              {leadIcon}
            </FlexItem>
            <Divider orientation={{ default: 'vertical' }} />
            <FlexItem flex={{ default: 'flex_1' }}>{titleBlock}</FlexItem>
          </Flex>
        ) : (
          titleBlock
        )}
        {alert && <FlexItem>{alert}</FlexItem>}
      </Flex>
    </PageSection>
  );
}
