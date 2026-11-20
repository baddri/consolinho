using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Audit;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Auth.LogOut;

/// <summary>Handles <see cref="LogOutCommand"/>: stages the <c>auth.logout</c> entry (session target, the user as actor).</summary>
internal sealed class LogOutHandler(ICurrentUser currentUser, IAuditTrail auditTrail) : IRequestHandler<LogOutCommand, Result>
{
    /// <inheritdoc />
    public Task<Result> Handle(LogOutCommand request, CancellationToken cancellationToken)
    {
        if (currentUser is not { UserId: { } userId, Username: { } username })
        {
            // AuthorizationBehavior already refuses anonymous callers; this guards direct handler use.
            return Task.FromResult<Result>(AuthErrors.Unauthenticated);
        }

        // Same shape as auth.login (T-0013): target = session, target id = user id, target name = username.
        auditTrail.Record(new AuditRecord(
            AuthAuditActions.Logout,
            AuditTargetType.Session,
            TargetId: userId.Value.ToString(),
            TargetName: username,
            ClusterName: null,
            Summary: $"{username} logged out",
            Details: null,
            Actor: AuditActor.ForUser(userId, username)));
        return Task.FromResult(Result.Success());
    }
}
