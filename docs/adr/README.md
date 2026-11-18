# Architecture Decision Records

One file per decision: `NNNN-kebab-title.md` with sections **Status** (Proposed/Accepted/Superseded by NNNN),
**Context**, **Decision**, **Consequences**. Architect agents write them; the orchestrator links them from task files.
Never edit an accepted ADR's decision — supersede it.

| # | Title | Status |
|---|---|---|
| 0001 | Technology stack | Accepted |
| 0002 | In-house CQRS dispatcher with pipeline behaviors | Accepted |
| 0003 | YARP IHttpForwarder for the Kubernetes proxy | Accepted |
| 0004 | SA token encryption with ASP.NET Data Protection | Accepted |
| 0005 | Local accounts + cookie sessions; OIDC later | Superseded by 0007 |
| 0006 | Single container serves API and SPA | Accepted |
| 0007 | Login via host cluster OpenShift OAuth | Accepted |
| 0008 | Audit entries in the same transaction via pre-commit domain event handlers | Accepted |
| 0009 | Cookie session revalidation, security stamp, and admin role sources | Accepted |
| 0010 | OpenShift OAuth handler wiring and the DevOAuth emulator | Accepted |
| 0011 | Connection test: step orchestration and capability probing | Accepted |
| 0012 | CSRF header check as middleware; the anonymous API surface | Accepted |
| 0013 | HTTP API conventions (resources, concurrency, enums, pagination) | Accepted |
| 0014 | SPA session handling, route guards and permission-aware UI | Accepted |
| 0015 | Forms, server validation errors, version conflicts and mutation feedback | Accepted |
| 0016 | Contract-first API types and an MSW mock backend for frontend work | Accepted |
| 0017 | Promote always records the admin assignment (refines 0009) | Accepted |
