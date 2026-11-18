using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace FleetConsole.DevOAuth.OAuth;

/// <summary>What an authorization code was issued for; checked again when the code is redeemed.</summary>
/// <param name="ClientId">The client the code was issued to; only that client may redeem it.</param>
/// <param name="RedirectUri">The <c>redirect_uri</c> of the authorize request; the token request must repeat it exactly.</param>
/// <param name="Scope">The granted scope, echoed in the token response.</param>
/// <param name="CodeChallenge">PKCE challenge from the authorize request, or null when the client sent none.</param>
/// <param name="CodeChallengeMethod"><c>S256</c> or <c>plain</c> when <paramref name="CodeChallenge"/> is set.</param>
/// <param name="UserName">The user picked on the authorize page.</param>
/// <param name="ExpiresAt">After this instant the code is rejected.</param>
internal sealed record AuthorizationCodeGrant(
    string ClientId,
    string RedirectUri,
    string Scope,
    string? CodeChallenge,
    string? CodeChallengeMethod,
    string UserName,
    DateTimeOffset ExpiresAt);

/// <summary>An issued access token: who it belongs to and until when <c>users/~</c> accepts it.</summary>
/// <param name="UserName">The user the token identifies.</param>
/// <param name="ExpiresAt">After this instant the token is rejected with 401.</param>
internal sealed record AccessTokenGrant(string UserName, DateTimeOffset ExpiresAt);

/// <summary>
/// In-memory state of the emulator: outstanding authorization codes and issued access tokens. Restarting the emulator
/// forgets everything, which is fine: FleetConsole discards the OpenShift token right after <c>users/~</c> (ADR-0007).
/// </summary>
/// <remarks>
/// Lifetimes follow OpenShift's defaults closely enough for the Api: codes are single-use and live
/// <see cref="CodeLifetime"/>; tokens live <see cref="TokenLifetime"/> (OpenShift's default
/// <c>accessTokenMaxAgeSeconds</c>, 86400). Expired entries are swept whenever a new code or token is issued, so the
/// dictionaries cannot grow without bound during long dev sessions. Time comes from <see cref="TimeProvider"/> so tests
/// can advance it.
/// </remarks>
internal sealed class DevOAuthStore(TimeProvider timeProvider)
{
    /// <summary>How long an authorization code can be redeemed after it was issued.</summary>
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromSeconds(60);

    /// <summary>How long an access token is accepted by <c>users/~</c>; also the token response's <c>expires_in</c>.</summary>
    public static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(24);

    /// <summary>Prefix of OpenShift 4 access tokens (the server stores only their SHA-256).</summary>
    private const string AccessTokenPrefix = "sha256~";

    private readonly ConcurrentDictionary<string, AuthorizationCodeGrant> _codes = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, AccessTokenGrant> _tokens = new(StringComparer.Ordinal);

    /// <summary>Issues a new single-use authorization code valid for <see cref="CodeLifetime"/>.</summary>
    /// <param name="clientId">Client the code is bound to.</param>
    /// <param name="redirectUri">Redirect URI the code is bound to.</param>
    /// <param name="scope">Granted scope.</param>
    /// <param name="codeChallenge">PKCE challenge, or null.</param>
    /// <param name="codeChallengeMethod">PKCE method, or null.</param>
    /// <param name="userName">The user who approved the request.</param>
    /// <returns>The opaque code to send back to the client's redirect URI.</returns>
    public string IssueCode(
        string clientId,
        string redirectUri,
        string scope,
        string? codeChallenge,
        string? codeChallengeMethod,
        string userName)
    {
        var now = timeProvider.GetUtcNow();
        SweepExpired(now);

        var code = RandomToken();
        _codes[code] = new AuthorizationCodeGrant(
            clientId, redirectUri, scope, codeChallenge, codeChallengeMethod, userName, now + CodeLifetime);
        return code;
    }

    /// <summary>
    /// Redeems a code: removes it (so it can never be used twice, even when the rest of the token request turns out to
    /// be invalid, which also stops guessing a PKCE verifier against one code) and returns what it was issued for.
    /// </summary>
    /// <param name="code">The code from the token request.</param>
    /// <returns>The grant, or null when the code is unknown, already used or expired.</returns>
    public AuthorizationCodeGrant? RedeemCode(string code) =>
        _codes.TryRemove(code, out var grant) && timeProvider.GetUtcNow() < grant.ExpiresAt ? grant : null;

    /// <summary>Issues an access token for <paramref name="userName"/>, valid for <see cref="TokenLifetime"/>.</summary>
    /// <param name="userName">The user the token identifies.</param>
    /// <returns>An OpenShift-style token: <c>sha256~</c> followed by 43 base64url characters.</returns>
    public string IssueAccessToken(string userName)
    {
        var now = timeProvider.GetUtcNow();
        SweepExpired(now);

        var token = AccessTokenPrefix + RandomToken();
        _tokens[token] = new AccessTokenGrant(userName, now + TokenLifetime);
        return token;
    }

    /// <summary>Looks up a bearer token presented to <c>users/~</c>.</summary>
    /// <param name="accessToken">The token from the <c>Authorization</c> header.</param>
    /// <returns>The token's grant, or null when the token is unknown or expired.</returns>
    public AccessTokenGrant? FindAccessToken(string accessToken) =>
        _tokens.TryGetValue(accessToken, out var grant) && timeProvider.GetUtcNow() < grant.ExpiresAt ? grant : null;

    /// <summary>32 random bytes, base64url without padding: 43 characters, like OpenShift's codes and tokens.</summary>
    private static string RandomToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    private void SweepExpired(DateTimeOffset now)
    {
        // Enumerating a ConcurrentDictionary while removing from it is safe (snapshot-free, no exceptions).
        foreach (var (code, grant) in _codes)
        {
            if (now >= grant.ExpiresAt)
            {
                _codes.TryRemove(code, out _);
            }
        }

        foreach (var (token, grant) in _tokens)
        {
            if (now >= grant.ExpiresAt)
            {
                _tokens.TryRemove(token, out _);
            }
        }
    }
}
