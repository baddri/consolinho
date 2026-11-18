namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Marks a command that changes FleetConsole state on behalf of the caller and must therefore be refused for
/// globally read-only users. Enforced by the <c>ReadOnlyGuardBehavior</c> (CP1). Self-service commands that read-only
/// users must still be able to run (e.g. changing their own password) simply do not implement it.
/// </summary>
public interface IMutatingCommand : IBaseCommand;
