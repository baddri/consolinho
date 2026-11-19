import {
  Alert,
  Button,
  ListItem,
  ListVariant,
  LoginPage as PfLoginPage,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { useSearchParams } from 'react-router';
import { useSystemInfo } from '@/shared/api';
import { buildLoginUrl } from '@/shared/auth';
import { loginMessage } from './loginMessage';

/** Footer line with the deployed version (anonymous `GET /api/system/info`); omitted while loading or on failure. */
function VersionFooterItem() {
  const { data } = useSystemInfo();
  return data ? (
    <ListItem className="pf-v6-u-text-break-word">
      FleetConsole {data.version} · {data.environment}
    </ListItem>
  ) : null;
}

/**
 * The login page (`/login`), outside the session guard (ADR-0014 §3-4).
 *
 * Shows one "Log in with OpenShift" link — a full-page navigation to the Api's OAuth start endpoint carrying the
 * sanitized `returnUrl` — and an inline message explaining why the user is here (`error`, `reason`, `loggedOut` query
 * parameters, see `loginMessage`). It never redirects into OAuth on its own (AUTH-10: logging out must not log the
 * user straight back in) and never asks `GET /api/auth/me`, so it cannot take part in a redirect loop (AUTH-12).
 */
export function LoginPage() {
  const [searchParams] = useSearchParams();
  const message = loginMessage(searchParams);

  return (
    <PfLoginPage
      loginTitle="Log in to FleetConsole"
      loginSubtitle="Use your OpenShift account of the host cluster."
      textContent="FleetConsole — one console for your OpenShift fleet."
      footerListVariants={ListVariant.inline}
      footerListItems={<VersionFooterItem />}
    >
      <Stack hasGutter>
        {message && (
          <StackItem>
            <Alert variant={message.variant} isInline title={message.text} />
          </StackItem>
        )}
        <StackItem>
          <Button component="a" href={buildLoginUrl(searchParams.get('returnUrl'))} variant="primary" isBlock>
            Log in with OpenShift
          </Button>
        </StackItem>
      </Stack>
    </PfLoginPage>
  );
}
