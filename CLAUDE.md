# FleetConsole — Claude working agreement

FleetConsole is a self-hosted, OpenShift-console-like web UI for operating **~40 OpenShift clusters** from one place,
with a **cluster switcher** in the masthead. The backend is an authenticating proxy: a user logs in to FleetConsole,
picks a cluster, and every Kubernetes API call is forwarded to that cluster's API server with the **ServiceAccount token
the admin assigned to that user for that cluster**. An admin area manages users, clusters, SA credentials and grants.

> **Orchestrating? Read `docs/process/HANDOVER.md` first** (the `/continue` skill does this). It says where we are and
> what is next. It is deliberately *not* imported here: every subagent loads this file, and they don't need it.
> To resume autonomous work, run the `/continue` skill. Before stopping, run `/handover`.


## Stack (decided — change only through an ADR in `docs/adr/`)

| Area | Choice |
|---|---|
| Backend | .NET 10, ASP.NET Core minimal APIs, **Aspire 17** (AppHost + ServiceDefaults; CLI 17.0.0, ADR-0025) |
| Architecture | DDD (Domain / Application / Infrastructure / Api), CQRS with an **in-house dispatcher + pipeline behaviors** |
| Proxy | YARP `IHttpForwarder` (direct forwarding; streaming, watch, WebSocket exec/logs) |
| Login | **OpenShift OAuth of the host cluster** (server-side auth code flow, ADR-0007); dev uses the in-repo emulator `FleetConsole.DevOAuth` |
| Persistence | PostgreSQL via EF Core (Npgsql); SA tokens encrypted with ASP.NET Data Protection |
| Validation | FluentValidation |
| Tests (BE) | xUnit v3, Shouldly, NSubstitute, Testcontainers (Postgres), WebApplicationFactory |
| Frontend | React + TypeScript + Vite, **PatternFly 6**, React Router, TanStack Query, react-hook-form + zod |
| Tests (FE) | Vitest + React Testing Library + MSW; Playwright for e2e (later checkpoints) |
| Container runtime | **podman** (no docker on dev machine) |
| Deploy target | OpenShift (one of the managed clusters); single container serves API + built SPA |

## Repository layout

```
FleetConsole.slnx
Directory.Build.props / Directory.Packages.props   # shared MSBuild + central package versions
src/
  FleetConsole.AppHost/          # Aspire orchestration (Postgres, Api, Vite dev server)
  FleetConsole.ServiceDefaults/  # OpenTelemetry, health checks, resilience defaults
  FleetConsole.Domain/           # Aggregates, value objects, domain events. NO framework deps.
  FleetConsole.Application/      # CQRS commands/queries/handlers, behaviors, ports (interfaces)
  FleetConsole.Infrastructure/   # EF Core, repositories, crypto, Kubernetes HTTP clients
  FleetConsole.Api/              # Endpoints, auth, proxy wiring, ProblemDetails, SPA hosting
tests/
  FleetConsole.Domain.Tests/  FleetConsole.Application.Tests/  FleetConsole.Api.Tests/
web/                             # Vite + React + PatternFly SPA
deploy/                          # Containerfile, kustomize manifests for OpenShift
docs/
  architecture/  OVERVIEW.md BACKEND.md FRONTEND.md SECURITY.md
  adr/           numbered architecture decision records
  plan/          ROADMAP.md (checkpoints)
  specs/         feature specs written by the product owner agent
  tasks/         one file per task — the source of truth for work status
  process/       SDLC.md, HANDOVER.md
```

## Non-negotiable rules

**Priorities: maintainability > correctness/security > performance > cleverness.** Performance still matters: no N+1,
stream proxy bodies, never buffer watch/log streams.

### General
1. Read the relevant architecture-doc sections before touching a layer: `docs/architecture/BACKEND.md` / `FRONTEND.md` /
   `SECURITY.md` (by section — see *Context & token discipline*).
2. Work is driven by task files in `docs/tasks/`. Don't start untracked work; create a task file if needed.
3. Small, focused changes. No drive-by refactors outside the task; note them as follow-up tasks instead.
4. Everything must build and tests must pass before a task is marked `in_review`:
   - Backend: `scripts/check-be.sh` (= `dotnet build FleetConsole.slnx -warnaserror` + `dotnet test FleetConsole.slnx`)
   - Frontend: `scripts/check-fe.sh` (= `cd web && npm run lint && npm run typecheck && npm test -- --run && npm run build`)
   - The scripts print only a summary + failures; the scripts print the full-log path. Use the raw commands only to debug.
5. Never commit secrets, tokens, kubeconfigs, or `.env` files. Test fixtures use obviously fake tokens.
6. Never run mutating `oc`/`kubectl` commands against real clusters. Read-only (`oc get`, `oc whoami`) only if the human asked.
7. Decisions that change the stack, layering, security model, or public API shape → write an ADR (`docs/adr/NNNN-title.md`).

### Backend
- Dependency direction: `Api → Application → Domain`, `Infrastructure → Application → Domain`. Domain references nothing.
- Every use case is a **command** (changes state, returns `Result`/`Result<T>`) or a **query** (no side effects).
  One folder per use case: `Application/<Feature>/<UseCase>/{Command|Query}.cs, Handler.cs, Validator.cs`.
- Cross-cutting concerns (validation, authorization, logging, transactions, audit, caching, mutation guard) live in
  **pipeline behaviors** or **proxy policies**, never copy-pasted into handlers.
- Domain invariants are enforced in aggregates (private setters, factory methods, guard clauses). No anemic "DTO entities".
- Expected failures return `Result` errors mapped to RFC 9457 ProblemDetails. Exceptions are for bugs/infrastructure.
- **XML doc comments on every public type and member** explaining *why* and *how it fits*, not restating the name.
  Non-obvious code gets inline comments. Comments are documentation — keep them true when code changes.
- `async` all the way, pass `CancellationToken` everywhere, nullable enabled, warnings are errors.

### Frontend
- Feature-based folders (`web/src/features/<feature>`), shared code in `web/src/shared`. Features don't import each other's internals.
- Use PatternFly components; **no direct DOM manipulation** (`document.querySelector`, etc.). Prefer well-maintained libraries over hand-rolled code.
- Server state in TanStack Query only; local UI state in component state; global client state (active cluster) derived from the URL.
- Kubernetes resources are described by **model descriptors** in a registry; generic list/detail/YAML pages render from them.
- Typed everything. No `any` (lint-enforced). Admin API types are generated from the backend OpenAPI document.
- Components and hooks get a short TSDoc comment explaining purpose and non-obvious behaviour.

## Context & token discipline (every agent, every session)

Everything you read stays in context and is re-sent on every later turn, so reading is the main cost of this project.
- **This file is already in your context. Never re-read it.** Read any other doc at most once per session.
- **Docs by section:** `grep -n '^#' <doc>` then Read with `offset`/`limit`. Don't read whole specs/contracts
  (`docs/specs/CP*`) — your task file holds your contract; grep the spec for a specific AC or endpoint if needed.
- **Code by symbol, not by file:** use the `LSP` tool (`documentSymbol`, `hover`, `goToDefinition`, `findReferences`,
  `workspaceSymbol`) or `grep -n`, then Read only the relevant range. Read whole files only when you will edit most of
  them. Never `cat` several files/directories at once (a hook blocks commands whose unfiltered `cat`/`sed -n`/`head`/`tail` reads exceed ~20 KB).
- **One exemplar:** to learn a pattern, read one existing example of it (e.g. one use-case folder), not all of them.
- **Library APIs:** `grep -n` the `.d.ts` / XML docs for the member you need; never dump `node_modules` files.
- **Output:** use `scripts/check-*.sh`; pipe any other noisy command through `tail`/`grep`. Re-run only what you
  changed while iterating (`scripts/check-fe.sh <test path>`, `dotnet test <project> --filter ...`); full gate once at the end.
- **Writing:** Work log entries ≤ 5 lines, Handover notes ≤ 15 lines, review findings one line each. Task files are
  read by every later agent.

## How work runs here (summary — full detail in `docs/process/SDLC.md`)

The main session is the **orchestrator**. It reads HANDOVER + ROADMAP, picks the next tasks, and delegates to the
project subagents in `.claude/agents/`:

| Agent | Use for |
|---|---|
| `ocp-product-owner` | Feature specs, acceptance criteria, UX review against real OCP day-2 workflows |
| `backend-architect` | Backend design, task breakdown, ADRs, code review of backend diffs |
| `frontend-architect` | Frontend design, task breakdown, ADRs, code review of frontend diffs |
| `backend-engineer` | Implementing backend tasks |
| `frontend-engineer` | Implementing frontend tasks |
| `ux-designer` | UI/UX audits against the OCP console, `docs/architecture/UX.md`, visual review of frontend diffs |
| `qa-engineer` | Test strategy, writing/running tests, verifying acceptance criteria, filing bug tasks |

The orchestrator runs autonomously until the **current checkpoint** is complete (or a blocker needs the human), committing
after each approved task, and keeps `docs/process/HANDOVER.md` current after every task — not only at session end.

## Commands

```bash
aspire run                                   # run everything locally (Postgres + Api + web) — needs podman socket
aspire start --launch-profile http && aspire wait web   # same, in the background (no dev cert needed); `aspire stop` ends it
dotnet build FleetConsole.slnx -warnaserror
dotnet test FleetConsole.slnx
dotnet tool restore && dotnet ef migrations add <Name> -p src/FleetConsole.Infrastructure -s src/FleetConsole.Api -o Persistence/Migrations
cd web && npm run dev | lint | typecheck | test | build
cd web && npm run gen:api   # Api must be running (Development); override with API_URL=...
```

Podman notes: `systemctl --user enable --now podman.socket`; export
`DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock`, `TESTCONTAINERS_RYUK_DISABLED=true`, `ASPIRE_CONTAINER_RUNTIME=podman`.
Setup, URLs and known issues: `README.md`, `docs/dev/TROUBLESHOOTING.md`.
