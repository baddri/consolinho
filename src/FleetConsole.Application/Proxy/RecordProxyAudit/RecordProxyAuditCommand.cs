using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Proxy.RecordProxyAudit;

/// <summary>
/// Records one proxied mutation, allowed or denied (PAUD-1..3, ADR-0021). The Api dispatches it once per mutation after
/// the outcome is known, with <see cref="CancellationToken.None"/>, and logs-and-swallows failures.
/// </summary>
/// <remarks>
/// Changes no aggregate: the handler stages the audit entry and returns success so <c>UnitOfWorkBehavior</c> saves it in
/// its own unit of work. Deliberately <b>not</b> <see cref="IMutatingCommand"/>: a read-only user's denied attempt must
/// be recorded, not refused by <c>ReadOnlyGuardBehavior</c>.
/// </remarks>
/// <param name="Record">What happened.</param>
public sealed record RecordProxyAuditCommand(ProxyAuditRecord Record) : ICommand, IRequireAuthenticated;
