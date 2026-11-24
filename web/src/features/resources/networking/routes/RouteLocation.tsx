import { ExternalLinkButton } from '@patternfly/react-component-groups';
import { ClipboardCopyButton } from '@patternfly/react-core';
// PF's inline clipboard-copy layout, as OCP `ExternalLinkWithCopy` (only `ClipboardCopy` itself would load it).
import '@patternfly/react-styles/css/components/ClipboardCopy/clipboard-copy.css';
import { useId, useState } from 'react';
import type { Route } from '@/shared/k8s';
import { DASH } from '@/shared/ui';
import { hostUrl } from '../linkOut';
import { isWildcardRoute, routeHost, routeLabel, routeStatus } from './routeStatus';

/**
 * The URL a browser can open for `route`, or `undefined`: only an admitted, non-wildcard route whose host and path pass
 * {@link hostUrl} (RT-2); https when `spec.tls` sets a termination (networking-plugin `isWebRoute` + `getRouteWebURL`).
 */
export function routeWebUrl(route: Route): string | undefined {
  if (routeStatus(route) !== 'Accepted' || isWildcardRoute(route)) return undefined;
  return hostUrl({ host: routeHost(route), path: route.spec.path, tls: Boolean(route.spec.tls?.termination) });
}

/**
 * OCP `ExternalLinkWithCopy` (`public/components/utils/link.tsx`): an inline external link (new tab, `noopener
 * noreferrer`) followed by a plain copy button, laid out as PF's inline clipboard-copy. The tooltip reads "Copy to
 * clipboard", then "Copied" until it hides.
 */
function ExternalLinkWithCopy({ href }: { href: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(href).then(() => setCopied(true));
  };
  return (
    <div className="pf-v6-c-clipboard-copy pf-m-inline">
      <span className="pf-v6-c-clipboard-copy__text" id={`link-${id}`}>
        {/* OCP `ExternalLink`: `display: inline` so long URLs wrap, plus its own icon gap. */}
        <ExternalLinkButton
          variant="link"
          isInline
          href={href}
          className="pf-v6-u-display-inline"
          iconProps={{ className: 'pf-v6-u-ml-xs' }}
        >
          {href}
        </ExternalLinkButton>
      </span>
      <span className="pf-v6-c-clipboard-copy__actions">
        <span className="pf-v6-c-clipboard-copy__actions-item">
          <ClipboardCopyButton
            id={`copy-${id}`}
            // OCP passes `textId` for this; PF 6 deprecated it and no longer maps it, so set `aria-controls` directly.
            aria-controls={`link-${id}`}
            aria-label="Copy to clipboard"
            onClick={copy}
            exitDelay={copied ? 1250 : 600}
            variant="plain"
            hasNoPadding
            maxWidth="120px"
            onTooltipHidden={() => setCopied(false)}
          >
            {/* OCP `co-nowrap`: keep the tooltip on one line. */}
            <span className="pf-v6-u-text-nowrap">{copied ? 'Copied' : 'Copy to clipboard'}</span>
          </ClipboardCopyButton>
        </span>
      </span>
    </div>
  );
}

/**
 * The Location of a route (networking-plugin `RouteLocation`): a link with a copy button when the route is served on
 * a valid host ({@link routeWebUrl}); otherwise its host as text (pending, rejected, wildcard or unsafe host), or a
 * dash without one.
 */
export function RouteLocation({ route }: { route: Route }) {
  const url = routeWebUrl(route);
  return (
    <div className="pf-v6-u-text-break-word">
      {url === undefined ? (routeLabel(route) ?? DASH) : <ExternalLinkWithCopy href={url} />}
    </div>
  );
}
