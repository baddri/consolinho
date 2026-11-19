namespace FleetConsole.Application.Auth.CompleteLogin;

/// <summary>
/// Outcome of <see cref="CompleteLoginCommand"/>. Internal plumbing between the Api's OAuth events and the use case,
/// never serialized to HTTP.
/// </summary>
/// <param name="Decision">Whether the login is allowed, and if not, why.</param>
/// <param name="User">What the session is built from; set only when <paramref name="Decision"/> is
/// <see cref="LoginDecision.Allowed"/>.</param>
public sealed record LoginOutcomeDto(LoginDecision Decision, SignedInUserDto? User);
