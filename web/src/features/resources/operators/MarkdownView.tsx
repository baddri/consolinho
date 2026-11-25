import { Content } from '@patternfly/react-core';
import Markdown, { type Components } from 'react-markdown';
import { httpUrl } from './csv';

/** Links open in a new tab without handing the opener over (CSV descriptions link to project sites). */
const COMPONENTS: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

/** react-markdown `urlTransform`: absolute http(s) URLs only; `''` makes the `a` override render plain text. */
function toHttpUrl(url: string): string {
  return httpUrl(url) ?? '';
}

/**
 * Markdown of a CSV author (OCP `MarkdownView`, which renders `marked` output sanitized in an iframe), here with
 * react-markdown: React elements only, no `dangerouslySetInnerHTML`. Raw HTML is dropped (`skipHtml`, so an embedded
 * `<script>` never renders), only absolute http(s) URLs survive (`urlTransform`: relative, `mailto:`, `javascript:` etc. become plain text), and
 * images are left out (the CSP blocks remote ones anyway). PatternFly `Content` gives the typography.
 */
export function MarkdownView({ content }: { content: string }) {
  return (
    <Content>
      <Markdown skipHtml disallowedElements={['img']} components={COMPONENTS} urlTransform={toHttpUrl}>
        {content}
      </Markdown>
    </Content>
  );
}
