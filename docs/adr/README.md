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
