import { Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { useNavigate } from 'react-router';
import styles from './PageTabs.module.css';

/** One URL-segment tab. */
export interface PageTab {
  key: string;
  title: string;
  /** Router path of the tab; also the anchor `href`, so middle-click opens it in a new browser tab. */
  to: string;
}

/** Props for {@link PageTabs}. */
export interface PageTabsProps {
  tabs: PageTab[];
  activeKey: string;
  'aria-label': string;
  /**
   * Called with a tab's key when the user shows intent to open it (pointer enters or focus lands on the tab), so the
   * page can start loading that tab's code early.
   */
  onTabIntent?: (key: string) => void;
}

/**
 * OCP horizontal nav (`public/components/utils/horizontal-nav.tsx`, `UX.md` §4): page-inset tabs directly under the
 * heading, so tab text lines up with the h1, with OCP's (PF 6.6) 45px bar height. Tabs are links; the content is the route `<Outlet/>` below (wrapped in
 * `PageBody`), never `Tab` children.
 *
 * The router owns history: PF's nav mode (`component="nav"`) would `history.pushState` behind the router's back, so
 * the tabs run in default mode inside our own `<nav>`. PF still prevents the anchor default; `onSelect` pushes the
 * route (like OCP's `Link`s) and ignores the already active tab. `href` stays for middle-click / open in new tab.
 */
export function PageTabs({ tabs, activeKey, 'aria-label': ariaLabel, onTabIntent }: PageTabsProps) {
  const navigate = useNavigate();
  return (
    <nav aria-label={ariaLabel}>
      <Tabs
        usePageInsets
        className={styles.tabs}
        activeKey={activeKey}
        onSelect={(_event, key) => {
          const next = tabs.find((tab) => tab.key === key);
          if (next && next.key !== activeKey) void navigate(next.to);
        }}
      >
        {tabs.map(({ key, title, to }) => (
          <Tab
            key={key}
            eventKey={key}
            href={to}
            title={<TabTitleText>{title}</TabTitleText>}
            aria-current={key === activeKey ? 'page' : undefined}
            onMouseEnter={onTabIntent && (() => onTabIntent(key))}
            onFocus={onTabIntent && (() => onTabIntent(key))}
          />
        ))}
      </Tabs>
    </nav>
  );
}
