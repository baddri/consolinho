import {
  Breadcrumb,
  BreadcrumbItem,
  Content,
  Flex,
  FlexItem,
  PageSection,
  Title,
} from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

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
  /** Left of the title, e.g. the feature's kind badge; shared code never knows kinds. */
  icon?: ReactNode;
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
 * OCP page heading (`console-shared/.../heading/PageHeading.tsx`, `UX.md` §3): breadcrumb → one row with
 * [icon] h1 + status + labels on the left and actions on the right (wrapping below, never overlapping) → subtitle →
 * alert. Every page renders exactly one.
 */
export function PageHeading({
  title,
  breadcrumbs,
  icon,
  status,
  labels,
  subtitle,
  actions,
  alert,
}: PageHeadingProps) {
  return (
    <PageSection hasBodyWrapper={false}>
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <FlexItem>
            <HeadingBreadcrumb crumbs={breadcrumbs} />
          </FlexItem>
        )}
        <Flex
          justifyContent={{ default: 'justifyContentSpaceBetween' }}
          alignItems={{ default: 'alignItemsCenter' }}
          flexWrap={{ default: 'wrap' }}
          gap={{ default: 'gapMd' }}
        >
          <Flex
            alignItems={{ default: 'alignItemsCenter' }}
            flexWrap={{ default: 'wrap' }}
            gap={{ default: 'gapSm' }}
          >
            {icon && <FlexItem>{icon}</FlexItem>}
            <FlexItem>
              <Title headingLevel="h1">{title}</Title>
            </FlexItem>
            {status && <FlexItem>{status}</FlexItem>}
            {labels && <FlexItem>{labels}</FlexItem>}
          </Flex>
          {actions && <FlexItem>{actions}</FlexItem>}
        </Flex>
        {subtitle && (
          <FlexItem>
            <Content component="p">{subtitle}</Content>
          </FlexItem>
        )}
        {alert && <FlexItem>{alert}</FlexItem>}
      </Flex>
    </PageSection>
  );
}
