# 0002 — In-house CQRS dispatcher with pipeline behaviors
**Status:** Accepted (2026-11-18)

## Context
We want CQRS with cross-cutting behaviors (validation, auth, read-only guard, unit of work, future caching). MediatR is now commercially licensed; source-generated alternatives add build magic.

## Decision
Own a small dispatcher (`IDispatcher`, `IRequestHandler<,>`, `IPipelineBehavior<,>`) in `Application/Abstractions/Messaging`, registered via assembly scanning. Behaviors are open generics executed in registration order. Fully documented and unit tested.

## Consequences
~100 lines we own; no license risk; trivial to debug (plain stack traces). Reflection cost per request is negligible versus network I/O; handler wrappers are cached per request type.
