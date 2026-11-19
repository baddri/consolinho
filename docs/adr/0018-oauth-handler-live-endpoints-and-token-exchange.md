# 0018 — OpenShift OAuth handler: live endpoints, configured redirect URI, classified token exchange
**Status:** Accepted (2026-11-19) · **Refines:** 0010

## Context
ADR-0010 planned three pieces of the `OpenShiftOAuthHandler` wiring that turned out not to work as written when T-0015
implemented them on ASP.NET Core 10:

1. **`BuildRedirectUri` is not virtual.** The plan was to override only that method so the `redirect_uri` comes from
   `Console:PublicOrigin`. It cannot be overridden.
2. **Copying endpoints into options + evicting the options cache can't serve the first login after an outage.**
   `UseAuthentication` initializes every remote handler (and so reads `OptionsMonitor.Get("OpenShift")`) at the start
   of **every** request, to check whether the request is its callback. `AuthenticationHandlerProvider` caches that
   handler instance for the request. `GET /api/auth/login` only awaits the metadata later, inside the endpoint, so the
   challenge in the request where discovery first succeeds would still use the placeholder endpoint captured at the
   start of the request.
3. **The base token exchange can't classify failures.** `OAuthHandler.ExchangeCodeAsync` treats network errors, 5xx
   and rejected codes alike (AUTH-14 needs `unavailable` vs `failed`), throws on a non-JSON error body, and copies the
   server's `error_description` into the failure message.

## Decision
- **Redirect URI:** the handler overrides the two virtual methods that consume `BuildRedirectUri`'s result —
  `BuildChallengeUrl` (authorize request) and `ExchangeCodeAsync` (token request) — and both use
  `{Console:PublicOrigin}{CallbackPath}`. The authorize and token legs therefore always carry the identical value
  (RFC 6749 §4.1.3). Nothing request-derived is used.
- **Endpoints are read live, not stored in options.** `OpenShiftOAuthOptionsSetup` (`IConfigureNamedOptions`, so it
  runs before the framework's post-configure and our backchannel is the only one created) sets fixed placeholders under
  `https://oauth-metadata-unavailable.invalid/` because the framework validates that endpoints are present. The handler
  reads `IOAuthServerMetadataProvider` when it uses an endpoint. `BuildChallengeUrl` lets the base build the query
  (client id, scope, `response_type`, `redirect_uri`, PKCE S256 challenge, protected state) and moves it onto the
  discovered authorization endpoint. `ExchangeCodeAsync` posts to the discovered token endpoint. There is no options
  eviction. `IOAuthServerMetadataProvider.MetadataChanged` has no consumer and is removed.
- **Token exchange is re-implemented** in `ExchangeCodeAsync` with the same request as the base: form body with
  `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret` (RFC 6749 §2.3.1 body
  credentials, as the base sends), and `code_verifier` taken from the encrypted state and removed from the properties
  (RFC 7636 §4.5). It is sent once, over the `openshift-host` client, which has no retries because codes are single-use.
  Outcomes:
  - network error or client timeout → throws `OAuthServerUnavailableException` → `unavailable`;
  - HTTP 5xx → `Failed(OAuthServerUnavailableException)` → `unavailable`;
  - other non-2xx (RFC 6749 §5.2: `invalid_grant`, `invalid_client`, …) → `Failed(AuthenticationFailureException)` →
    `failed`;
  - 2xx whose body is not a JSON object → `failed`;
  - 2xx JSON object → `OAuthTokenResponse.Success`; the base still rejects a response without `access_token`.

  Failure messages carry the status code or the exception type only. The remote body is never read into a message or log.
- **Authorize-leg errors** (RFC 6749 §4.1.2.1) map as follows: `access_denied` → `cancelled`;
  `temporarily_unavailable` and `server_error` → `unavailable` (the RFC defines both as server-side conditions, which is
  what "unavailable" tells the user); everything else → `failed`.
- **Session properties:** the cookie is issued with fresh `AuthenticationProperties { IsPersistent = true }`. Nothing
  from the OAuth leg (state items, verifier, redirect) reaches the session ticket.
- **Framework log of remote text:** `RemoteAuthenticationHandler` logs every failure's `Message` at Information
  ("Error from RemoteAuthentication"). For authorize-leg errors, that message includes the server's
  `error_description`/`error_uri`. The Api raises the minimum level of the handler's log category so that text is not
  logged. Our own EventId 2200 entry (outcome, exception type, trace id) is the record of the failure.

## Consequences
- One more overridden method (`ExchangeCodeAsync`, ~60 lines) than ADR-0010 planned. If a future ASP.NET Core makes
  `BuildRedirectUri` virtual or adds failure classification, revisit this and shrink the override.
- The handler depends on `IOAuthServerMetadataProvider` and `PublicOriginOptions` directly. The challenge throws a bug
  exception if metadata is missing, which can't happen because only `GET /api/auth/login` challenges and it awaits the
  metadata first.
- Integration tests must cover each token-exchange outcome through HTTP (stubbed token endpoint), plus the
  "first login after the host comes back" case (`LoginOutcomeTests`).
- `Auth:RevalidationInterval = 0` (revalidate every request) is a valid setting. Tests use it. It costs one DB read per
  request, so production keeps the 60 s default (ADR-0009).
