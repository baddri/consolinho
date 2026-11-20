namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>A categorized failure of one probe call.</summary>
/// <param name="Kind">The category the connection test maps to a step outcome and a plain-language hint.</param>
/// <param name="Message">A short, user-safe description. Never contains the token, response bodies or raw exception
/// dumps; at most the host name and the HTTP status.</param>
public sealed record ProbeFailure(ProbeFailureKind Kind, string Message);
