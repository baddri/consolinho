using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Auth.CompleteLogin;

/// <summary>
/// Decides whether an OpenShift-authenticated person may have a FleetConsole session, and records the login (AUTH-5..8,
/// ADR-0007/0009). Dispatched by the Api's OAuth callback (<c>OnTicketReceived</c>) after <c>users/~</c> answered.
/// </summary>
/// <remarks>
/// <para>Anonymous by design (there is no session yet) and not <see cref="IMutatingCommand"/>: a globally read-only user
/// may still log in.</para>
/// <para>A <b>denied</b> login is a successful command whose outcome says why (ADR-0008 §4), so
/// <c>UnitOfWorkBehavior</c> saves its <c>auth.login_denied</c> audit entry.</para>
/// <para>Carries no token, so the record's generated <c>ToString</c> is safe to log. Keep it that way.</para>
/// </remarks>
/// <param name="Identity">The identity reported by the host cluster.</param>
public sealed record CompleteLoginCommand(ExternalIdentity Identity) : ICommand<LoginOutcomeDto>;
