import { ErrorState, NotFoundIcon } from '@patternfly/react-component-groups';
import { Button } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

/** Router link to `/` that PatternFly's `Button` can render as (keeps client-side navigation). */
function HomeLink(props: Omit<LinkProps, 'to'>) {
  return <Link {...props} to="/" />;
}

/** "Return to homepage" — the footer action of OCP's 404 page. */
export function ReturnToHomepageButton() {
  return (
    <Button variant="link" component={HomeLink}>
      Return to homepage
    </Button>
  );
}

/** Props for {@link NotFoundPage}; all optional — the defaults are OCP's 404 copy. */
export interface NotFoundPageProps {
  /** The `h1` (default "404: Page Not Found"). */
  title?: string;
  /** Body sentence (default "We couldn't find that page."). */
  body?: ReactNode;
  /** Footer actions (default {@link ReturnToHomepageButton}). */
  footer?: ReactNode;
  /** Browser tab title (default "Page Not Found (404)"). */
  documentTitle?: string;
  /** `h2` when the page already has an `h1` (a missing object under its details heading); default `h1`. */
  headingLevel?: 'h1' | 'h2';
}

/**
 * Not-found page in OCP's layout (`public/components/error.tsx` `ErrorPage404`, `UX.md` §10): component-groups
 * `ErrorState` with the `NotFoundIcon` illustration, no status icon, the title as the page's only `h1`, one sentence
 * and a "Return to homepage" link button. Lives in `shared/ui` so features reuse the layout for their own
 * "not available" pages by overriding the copy and footer, as OCP's `ErrorPage404` takes `ErrorState` props.
 */
export function NotFoundPage({
  title = '404: Page Not Found',
  body = "We couldn't find that page.",
  footer = <ReturnToHomepageButton />,
  documentTitle = 'Page Not Found (404)',
  headingLevel = 'h1',
}: NotFoundPageProps) {
  return (
    <>
      {/* React 19 hoists <title> into <head> (OCP `DocumentTitle`). */}
      <title>{documentTitle}</title>
      <ErrorState
        status="none"
        icon={NotFoundIcon}
        headingLevel={headingLevel}
        titleText={title}
        defaultBodyText={body}
        customFooter={footer}
      />
    </>
  );
}
