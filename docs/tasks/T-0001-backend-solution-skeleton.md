---
id: T-0001
title: Backend solution skeleton with Aspire
status: todo
owner: backend-engineer
checkpoint: 0
depends_on: []
paths: [FleetConsole.slnx, Directory.Build.props, Directory.Packages.props, global.json, .editorconfig, src/, tests/]
review_rounds: 0
---

## Goal
Create the .NET solution layout every later task builds on (see `docs/architecture/BACKEND.md`).

## Scope
- In: `global.json` (SDK 10.0.x, rollForward latestFeature); `FleetConsole.slnx`; `Directory.Build.props` (net10.0,
  nullable, implicit usings, `TreatWarningsAsErrors`, `GenerateDocumentationFile` true for src projects, analyzers
  `AnalysisLevel latest-recommended`); `Directory.Packages.props` (central package management); `.editorconfig`
  (C# style: file-scoped namespaces, `var` when apparent, 4 spaces; 2 spaces for json/ts/yaml).
- Projects: `src/FleetConsole.{Domain,Application,Infrastructure,Api,AppHost,ServiceDefaults}`,
  `tests/FleetConsole.{Domain,Application,Api}.Tests` (xUnit v3 + Shouldly + NSubstitute). Project references per BACKEND.md.
- ServiceDefaults from the Aspire 13 template (OpenTelemetry, health checks, service discovery, resilience).
- AppHost: Postgres (`AddPostgres("postgres").WithDataVolume().AddDatabase("consoledb")`, pgAdmin optional off) and
  the Api project referencing the database with `WaitFor`. (The Vite app is added in T-0004.)
- Api: minimal Program.cs with `AddServiceDefaults`, `MapDefaultEndpoints`, empty `/api` route group placeholder.
- One trivial passing test per test project so the pipeline is green.
- Out: dispatcher, EF, endpoints (T-0002/T-0004).

## Contract / design notes
Root namespace `FleetConsole.*`. Use `dotnet new aspire-apphost` / `aspire-servicedefaults` templates (Aspire 13.6 is installed),
then adapt. XML docs required, so suppress CS1591 only in tests and AppHost if needed (document why in Directory.Build.props).

## Acceptance criteria
- [ ] `dotnet build FleetConsole.slnx -warnaserror` passes
- [ ] `dotnet test FleetConsole.slnx` passes
- [ ] Reference graph matches BACKEND.md (Domain has no project/package references)
- [ ] All package versions in Directory.Packages.props, none in csproj

## Work log

## Review

## Handover notes
