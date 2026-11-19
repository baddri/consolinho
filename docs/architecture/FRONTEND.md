# Frontend architecture

Goal: an OpenShift-console-like UI where adding a resource kind or a page is mostly declarative, and where any
engineer can find the code for what they see on screen within a minute.

## Stack

React + TypeScript (strict) + Vite, **PatternFly 6** (`@patternfly/react-core`, `react-table`, `react-icons`,
`react-code-editor` for YAML, `react-log-viewer` for logs), React Router (data router), TanStack Query,
react-hook-form + zod, `yaml`, `kubernetes-types` (TS types only), xterm.js for exec (later),
`openapi-typescript` + `openapi-fetch` for the admin/auth API. Pin exact versions; use the React major that PatternFly 6 officially supports.

## Folder structure

```
web/src/
  app/                    # bootstrapping only
    main.tsx  App.tsx  router.tsx  providers.tsx (QueryClient, theme)
    layout/               # AppShell: Masthead (logo, ClusterSwitcher, user menu), Sidebar nav, page container
  shared/                 # no feature knowledge
    api/                  # openapi-fetch client for /api (generated schema in api/schema.gen.ts), error → ProblemDetails
                          #   baseUrl = page origin: OpenAPI paths already include the /api prefix (Api maps MapGroup("/api"))
                          #   errors.ts (ApiError, unwrap), schema.ts (merged types, ADR-0016), types.ts (named aliases)
    auth/                 # login-navigation contract rules (§4.1, ADR-0014 §4): sanitizeReturnUrl, buildLoginUrl, isLoginPath.
                          #   Pure, relative imports only — also used by app/session.ts, mocks/browser.ts, vite.config.ts
    forms/                # RHF ⇄ PatternFly field adapters, applyServerErrors, FormProblemAlert, ConflictAlert (ADR-0015)
    table/                # admin list kit: useUrlFilters, FilterToolbar, useClientSort, TableStateRows
    k8s/                  # Kubernetes data layer over the proxy
      models.ts           # K8sModel descriptors: group, version, kind, plural, namespaced, label, abbr
      client.ts           # k8sList/k8sGet/k8sCreate/k8sPatch/k8sDelete — URL building in ONE place
      watch.ts            # streaming watch (fetch + ReadableStream, NDJSON) with resourceVersion resume
      hooks.ts            # useK8sList / useK8sGet / useK8sWatch → TanStack Query, keyed by [cluster, model, ns, ...]
      access.ts           # useCanI(verb, model, ns) via SelfSubjectAccessReview
    ui/                   # reusable presentational pieces: ResourceLink, StatusLabel, RelativeTime, LabelList, ErrorState,
                          #   ConfirmModal, EnvironmentLabel, ActionButton (disabled-with-reason), ToastProvider/useToast
    hooks/  utils/
  mocks/                  # MSW mock backend from the contract types: fixtures/, db.ts, session.ts, handlers/, browser.ts (ADR-0016)
  features/
    auth/                 # LoginPage, RequireSession, useCurrentUser, UserMenu, useLogout (ADR-0014)
    cluster-context/      # ClusterSwitcher, useAccessibleClusters, ClusterGate, LandingRedirect, NoClustersPage,
                          #   useActiveCluster (from URL), NamespaceSelector (CP2), recent clusters
    resources/            # generic resource browser — the core engine
      registry/           # ResourceDescriptor per kind: columns, detail tabs, actions, status getter
      ResourceListPage.tsx  ResourceDetailsPage.tsx  ResourceYamlTab.tsx  ResourceEventsTab.tsx
    workloads/            # kind-specific extras: PodLogs, PodTerminal, ScaleAction, RolloutRestartAction
    networking/  storage/  compute/  home/ (overview, search, events)
    admin/                # routes.tsx (lazy route objects), RequireAdmin, useAdminAccess, queryKeys.ts
      users/ clusters/ credentials/ connection-test/ grants/ audit/   # one folder per area: api.ts (hooks), pages, dialogs
  test/                   # render helpers, MSW server (handlers come from mocks/)
```

Boundary elements (ESLint): `app`, `shared/*`, `feature/*`, `mocks` (imports `shared` only), `test` (imports
`app`, `shared`, `mocks`, feature public APIs). Of `app`, only `main.tsx` may import `mocks` (dynamic import of `mocks/browser` in mock mode).

Rule: a feature may import from `shared/` and from another feature's **public `index.ts`** only. ESLint
(`import/no-restricted-paths` or `eslint-plugin-boundaries`) enforces this.

## Routing — the URL is the context

```
/login                                         # "Log in with OpenShift" → full-page redirect to /api/auth/login?returnUrl=…
/c/:cluster/overview
/c/:cluster/search
/c/:cluster/ns/:namespace/:resource            # list (namespace "all" = all namespaces)
/c/:cluster/ns/:namespace/:resource/:name      # details (tabs: details | yaml | events | logs | terminal ...)
/c/:cluster/cluster/:resource[/:name]          # cluster-scoped kinds (nodes, PVs, namespaces...)
/admin/users                                   # ?q=&role=&status=&readOnly=
/admin/users/:username[/access]                # tabs: details (index) | access; username URL-encoded
/admin/clusters                                # ?q=&env=&status=
/admin/clusters/new
/admin/clusters/:name[/credentials|/access]    # tabs: details (index) | credentials | access
/admin/clusters/:name/edit
/admin/credentials                             # ?q=&expiry=&env=  (CRED-8 links here pre-filtered)
/admin/audit                                   # ?actor=&user=&category=&cluster=&target=&range=|from=&to=
```

- `/login` is outside the session guard; everything else is inside `RequireSession`, `/admin/*` inside
  `RequireAdmin` (ADR-0014). Unknown admin paths → 404.
- `/` → `LandingRedirect` (last used cluster if still granted, else first; zero clusters → "No clusters assigned").
  `/c/:cluster/*` is wrapped in `ClusterGate` (cluster not in the user's list → "not available" page, SW-5).
- Tabs are URL segments so links (post-create → Credentials tab, audit deep links) and reload work.
- **Route-level code splitting:** features export `RouteObject`s whose pages use React Router `lazy`
  (`lazy: () => import('./users/UsersListPage')` inside the feature). The app imports only the feature's `index.ts`;
  page code lands in separate chunks. Vendor code is split into stable chunks in `vite.config.ts` so no chunk exceeds
  Vite's 500 kB warning without raising the limit.

- `useActiveCluster()` reads `:cluster` from the URL — no global store to drift out of sync. Links are shareable.
- Switching cluster keeps the current page type where it makes sense (`/c/a/ns/x/pods` → `/c/b/ns/x/pods`, falling back
  to the cluster overview if the namespace doesn't exist).
- Last-used cluster and namespace per cluster are remembered in `localStorage` (convenience only).
- Environment tag drives a coloured label in the masthead (e.g. prod = red) so users always know where they are.

## The resource registry

```ts
export const deploymentDescriptor: ResourceDescriptor<Deployment> = {
  model: DeploymentModel,
  columns: [nameColumn(), namespaceColumn(), { id: 'status', title: 'Status', cell: d => <DeploymentStatus d={d} /> }, ageColumn()],
  detailTabs: [detailsTab(DeploymentDetails), yamlTab(), podsTab(), eventsTab()],
  actions: [scaleAction, rolloutRestartAction, editLabelsAction, deleteAction],
};
```

Adding a kind = one descriptor file + register it + optional kind-specific components. The generic pages handle
loading/error/empty states, filtering, sorting, pagination and watch updates.

## Data fetching rules

- All k8s calls go through `shared/k8s/client.ts`; all FleetConsole API calls through `shared/api`.
- Query keys always start with `['k8s', cluster, ...]` so switching cluster can never show another cluster's data.
- Lists use watch to stay live; fall back to polling when watch fails. Keep watches per visible list only.
- Mutations invalidate/update the relevant query keys; show PatternFly alerts for success/failure.
- A 403 from the MutationGuard policy shows its `detail` ("Your access to cluster X is read-only").
- All non-GET `/api` requests send `X-Console-Request: 1` (CSRF defence, see SECURITY.md).
- FleetConsole API hooks call `apiClient` through `unwrap()` and throw only `ApiError` (ADR-0015). A 401 anywhere is
  handled once by the QueryClient (ADR-0014) — never per component.
- `ApiError` is registered as TanStack Query's default error type (`shared/api/queryRegister.ts`), so `error` is typed
  without generics or casts. That type is a promise: every query/mutation function must throw only `ApiError` (go
  through `unwrap`/`unwrapNoContent`). A client with another error shape (e.g. the CP2 k8s client) either maps to
  `ApiError` or widens the registered type in the same change.
- FleetConsole API query keys start with `'api'` and mirror the URL:

  | Key | Endpoint |
  |---|---|
  | `['api','system','info']` | `GET /api/system/info` |
  | `['api','auth','me']` | `GET /api/auth/me` |
  | `['api','clusters']` | `GET /api/clusters` (switcher; refetch on focus, every 5 min) |
  | `['api','admin','users']` / `[…,'users',username]` / `[…,'users',username,'grants']` | users list / detail / grants |
  | `['api','admin','clusters']` / `[…,'clusters',name]` / `[…,name,'credentials']` / `[…,name,'grants']` | clusters |
  | `['api','admin','credentials']` | fleet credentials |
  | `['api','admin','audit',filters]` | audit (infinite query, cursor) |

  Keys are built by factories (`features/admin/queryKeys.ts`, `features/auth`, `features/cluster-context`), never
  inline. Admin mutations `setQueryData` the returned representation and invalidate the `['api','admin']` prefix
  (+ `['api','clusters']` for grant and cluster changes).

## Session and permissions (ADR-0014)

- `useCurrentUser()` (`GET /api/auth/me`) is the only source of identity, role and read-only state.
- Logout and session end navigate to `/login` first (`flushSync`), then `clearSessionCache` drops every unobserved
  query and all mutations. Only anonymous data may be observed outside `RequireSession` (ADR-0014 amendment).
- Mutating admin controls stay visible; when not allowed they are `isAriaDisabled` with a tooltip giving the reason
  (`useAdminAccess().readOnlyReason`, or a row-specific reason). Server 403s are still shown with their `detail`.

## Forms (ADR-0015)

react-hook-form + zod schema next to the form; PF field adapters from `shared/forms`; server 400s mapped onto fields
with `applyServerErrors`; 409 version conflicts shown by `ConflictAlert` without clearing input; confirmations via
`ConfirmModal`; success via `useToast()`.

## Admin list pages

- Toolbar (`SearchInput` + checkbox `Select` filters with `ToolbarFilter` labels and "Clear all filters") above a
  composable PF `Table` (`Thead/Tbody/Tr/Th/Td`, sortable `Th`, `ActionsColumn` kebab per row).
- Lists are bounded arrays: filtering and sorting happen client-side; **filter state lives in the URL search params**
  (`useUrlFilters`) so filtered views are linkable (CRED-8, AUD-4) and survive reload.
- States: loading → skeleton rows; error → `ErrorState` (ProblemDetails `detail` + Retry); empty → EmptyState with
  the primary action; filtered-to-nothing → "No … match" + "Clear filters".
- Relative timestamps via `RelativeTime` (absolute in a tooltip). Environment colour via `EnvironmentLabel` (same
  component as the switcher).

## UI conventions

- PatternFly components and tokens only; no custom CSS unless unavoidable (then CSS modules, colocated).
- No DOM access: the global `document` and `window.document` / `globalThis.document` / `self.document` are
  lint-forbidden outside `app/main.tsx`, `shared/theme/ThemeProvider.tsx` and test files. Full-page navigation uses
  links (`<a href>`), not `location` assignments.
  The one allowed imperative pattern is **focus delegation through a ref the component owns**: when a PatternFly
  control doesn't forward refs, the adapter may wrap it in its own element and call `focus()` on the first control
  inside that element (`useWrapperFocusRef`, `shared/forms`). The lookup must start from that ref, never from
  `document`, and may only read and focus. It must not change attributes, classes or structure.
- Every page handles loading (Skeleton), error (ErrorState with retry), empty (EmptyState) explicitly.
- Destructive actions use a confirm modal that names the resource and cluster.
- Respect `useCanI` to hide/disable actions the user can't perform; still handle 403 gracefully.
- Dark theme support via PatternFly's theme class (`pf-v6-theme-dark` on `<html>`); light/dark toggle in the masthead.
  `shared/theme/ThemeProvider` is the only code allowed to touch the document (PF dark tokens live on `:root` and
  menus are portalled); the choice is remembered in `localStorage`, defaulting to the OS preference.

## Testing

- Unit/component: Vitest + RTL + MSW (mock `/api/...` and `/api/clusters/:c/k8s/...`). FleetConsole API mocks come
  from `src/mocks` (typed with `openapi-msw`, stateful in-memory db reset after each test; `setMockUser()` switches
  persona). Tests override single endpoints with `server.use(...)` for error cases.
- `npm run dev:mock` runs the SPA against the MSW browser worker, without the backend (ADR-0016, T-0042). Persona:
  `?mockUser=<admin|alice|bob|ines|carol|none>` on any URL (kept in `sessionStorage` for the tab), else
  `VITE_MOCK_USER`, else `admin`. The worker script lives in `web/msw/` (Vite `publicDir` in mock mode only), so it
  never reaches `dist/`; the `MODE === 'mock'` branch in `main.tsx` is removed from production builds.
- Each generic page and descriptor has at least a render test with fixture data.
- Load-proof page tests (`src/test/coldStart.ts`): the first full-app render of a file gets `COLD_START_TIMEOUT_MS` on
  its first `findBy*` (test option `timeout: COLD_START_TEST_TIMEOUT_MS`); files that visit lazy routes call
  `beforeAll(() => preloadLazyRoutes(...))`. Fill search/filter inputs with `user.paste` (one input event) unless the
  test is about keystrokes; `delay: null` does not help when each keystroke re-renders. Never raise global timeouts.
- E2E (later): Playwright against `aspire run` with a fake apiserver.
