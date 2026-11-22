import {
  Form,
  PageSection,
  Sidebar,
  SidebarContent,
  SidebarPanel,
  Tab,
  TabContent,
  Tabs,
  TabTitleText,
} from '@patternfly/react-core';
import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTheme, type ContrastPreference, type ThemePreference } from '@/shared/theme';
import { PageHeading } from '@/shared/ui';
import { USER_PREFERENCES_PATH } from './paths';
import { PreferenceSelectField, type PreferenceOption } from './PreferenceSelectField';

const GENERAL_TAB = 'general';

/** OCP `console.theme` options (`console-app/console-extensions.json`). */
const COLOR_SCHEME_OPTIONS: readonly PreferenceOption<ThemePreference>[] = [
  { value: 'system', label: 'System default' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** OCP `console.theme/contrast` options, without "Traditional" (not offered). */
const CONTRAST_OPTIONS: readonly PreferenceOption<ContrastPreference>[] = [
  {
    value: 'system',
    label: 'System default',
    description: "Matches your operating system's contrast setting.",
  },
  { value: 'glass', label: 'Glass', description: 'A modern, visually refreshed console appearance.' },
  {
    value: 'contrast',
    label: 'High contrast',
    description: 'Enhances contrast between interface elements for readability.',
  },
];

/** The General tab: colour scheme and contrast mode, saved on change. */
function GeneralPreferences() {
  const { preference, setPreference, contrastPreference, setContrastPreference } = useTheme();
  return (
    <Form onSubmit={(event) => event.preventDefault()}>
      <PreferenceSelectField
        id="console.theme"
        label="Color scheme"
        description="Console will appear as per the selected theme."
        options={COLOR_SCHEME_OPTIONS}
        value={preference}
        onChange={setPreference}
      />
      <PreferenceSelectField
        id="console.theme-contrast"
        label="Contrast mode"
        description="Controls the contrast level of the console."
        options={CONTRAST_OPTIONS}
        value={contrastPreference}
        onChange={setContrastPreference}
      />
    </Form>
  );
}

/**
 * "User preferences" (OCP `UserPreferencePage`): heading with the autosave help text, then vertical secondary tabs in
 * a sticky sidebar panel and the active tab's form at half width on wide screens. Only the General tab exists (the
 * settings FleetConsole supports); changes apply and persist at once. Browser-local, not cluster-scoped.
 */
export function UserPreferencesPage() {
  const navigate = useNavigate();
  const generalRef = useRef<HTMLElement>(null);
  const generalHref = `${USER_PREFERENCES_PATH}/${GENERAL_TAB}`;
  return (
    <>
      <PageHeading
        title="User preferences"
        subtitle="Set your individual preferences for the console experience. Any changes will be autosaved."
      />
      <PageSection hasBodyWrapper={false}>
        <Sidebar hasGutter>
          <SidebarPanel variant="sticky">
            <Tabs
              activeKey={GENERAL_TAB}
              isVertical
              variant="secondary"
              aria-label="User preferences"
              onSelect={(event, key) => {
                event.preventDefault();
                void navigate(`${USER_PREFERENCES_PATH}/${String(key)}`, { replace: true });
              }}
            >
              <Tab
                eventKey={GENERAL_TAB}
                title={<TabTitleText>General</TabTitleText>}
                href={generalHref}
                tabContentId={GENERAL_TAB}
                tabContentRef={generalRef}
              />
            </Tabs>
          </SidebarPanel>
          <SidebarContent>
            <TabContent
              className="pf-v6-u-w-75-on-lg pf-v6-u-w-50-on-xl"
              eventKey={GENERAL_TAB}
              id={GENERAL_TAB}
              ref={generalRef}
            >
              <GeneralPreferences />
            </TabContent>
          </SidebarContent>
        </Sidebar>
      </PageSection>
    </>
  );
}
