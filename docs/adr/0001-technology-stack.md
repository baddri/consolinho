# 0001 — Technology stack
**Status:** Accepted (2026-11-18)

## Context
Team requirement: C# backend bootstrapped with Aspire, PostgreSQL, PatternFly frontend, hosted on OpenShift. Maintainability first, performance second.

## Decision
.NET 10 + ASP.NET Core minimal APIs + Aspire 13; EF Core/Npgsql; React + TypeScript + Vite + PatternFly 6; TanStack Query; podman for local containers. Central package management (`Directory.Packages.props`). Library licenses must be permissive (MIT/Apache/BSD) — this excludes MediatR ≥13 and FluentAssertions ≥8 (commercial).

## Consequences
Single language per tier, strong typing end to end (OpenAPI → generated TS types).
