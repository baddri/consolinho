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
    k8s/                  # Kubernetes data layer over the proxy
      models.ts           # K8sModel descriptors: group, version, kind, plural, namespaced, label, abbr
      client.ts           # k8sList/k8sGet/k8sCreate/k8sPatch/k8sDelete — URL building in ONE place
      watch.ts            # streaming watch (fetch + ReadableStream, NDJSON) with resourceVersion resume
      hooks.ts            # useK8sList / useK8sGet / useK8sWatch → TanStack Query, keyed by [cluster, model, ns, ...]
      access.ts           # useCanI(verb, model, ns) via SelfSubjectAccessReview
    ui/                   # reusable presentational pieces: ResourceLink, StatusLabel, Timestamp, LabelList, EmptyState, ErrorState, ConfirmModal
    hooks/  utils/
  features/
    auth/                 # login page, session guard, useCurrentUser
    cluster-context/      # ClusterSwitcher, useActiveCluster (from URL), NamespaceSelector, recent clusters
    resources/            # generic resource browser — the core engine
      registry/           # ResourceDescriptor per kind: columns, detail tabs, actions, status getter
      ResourceListPage.tsx  ResourceDetailsPage.tsx  ResourceYamlTab.tsx  ResourceEventsTab.tsx
    workloads/            # kind-specific extras: PodLogs, PodTerminal, ScaleAction, RolloutRestartAction
    networking/  storage/  compute/  home/ (overview, search, events)
    admin/                # users, clusters, credentials, grants, audit (uses generated API types)
  test/                   # MSW handlers, render helpers, fixtures
```

Rule: a feature may import from `shared/` and from another feature's **public `index.ts`** only. ESLint
(`import/no-restricted-paths` or `eslint-plugin-boundaries`) enforces this.

## Routing — the URL is the context

```
/login
/c/:cluster/overview
/c/:cluster/search
/c/:cluster/ns/:namespace/:resource            # list (namespace "all" = all namespaces)
/c/:cluster/ns/:namespace/:resource/:name      # details (tabs: details | yaml | events | logs | terminal ...)
/c/:cluster/cluster/:resource[/:name]          # cluster-scoped kinds (nodes, PVs, namespaces...)
/admin/users | /admin/clusters | /admin/credentials | /admin/audit   # /admin/:section; unknown section → 404
```

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

## UI conventions

- PatternFly components and tokens only; no custom CSS unless unavoidable (then CSS modules, colocated).
- Every page handles loading (Skeleton), error (ErrorState with retry), empty (EmptyState) explicitly.
- Destructive actions use a confirm modal that names the resource and cluster.
- Respect `useCanI` to hide/disable actions the user can't perform; still handle 403 gracefully.
- Dark theme support via PatternFly's theme class (`pf-v6-theme-dark` on `<html>`); light/dark toggle in the masthead.
  `shared/theme/ThemeProvider` is the only code allowed to touch the document (PF dark tokens live on `:root` and
  menus are portalled); the choice is remembered in `localStorage`, defaulting to the OS preference.

## Testing

- Unit/component: Vitest + RTL + MSW (mock `/api/...` and `/api/clusters/:c/k8s/...`).
- Each generic page and descriptor has at least a render test with fixture data.
- E2E (later): Playwright against `aspire run` with a fake apiserver.
