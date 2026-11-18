using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace FleetConsole.DevOAuth.OAuth;

/// <summary>
/// Proof Key for Code Exchange (RFC 7636) checks, with the two methods OpenShift advertises: <c>S256</c> and
/// <c>plain</c>. The Api always uses <c>S256</c> (ASP.NET Core's OAuth handler with <c>UsePkce = true</c>).
/// </summary>
internal static partial class Pkce
{
    /// <summary>The SHA-256 method: challenge = BASE64URL(SHA256(ASCII(verifier))).</summary>
    public const string S256 = "S256";

    /// <summary>The plain method: challenge = verifier. Default when a challenge is sent without a method (RFC 7636 §4.3).</summary>
    public const string Plain = "plain";

    /// <summary>Whether <paramref name="method"/> is one of the supported methods (case-sensitive, as in the RFC).</summary>
    /// <param name="method">The <c>code_challenge_method</c> value.</param>
    /// <returns>True for <c>S256</c> and <c>plain</c>.</returns>
    public static bool IsSupportedMethod(string method) =>
        string.Equals(method, S256, StringComparison.Ordinal) || string.Equals(method, Plain, StringComparison.Ordinal);

    /// <summary>
    /// Whether <paramref name="value"/> has the shape RFC 7636 requires of a verifier (and therefore of a plain
    /// challenge; an S256 challenge is 43 base64url characters, which also matches): 43-128 unreserved characters.
    /// </summary>
    /// <param name="value">A <c>code_verifier</c> or <c>code_challenge</c>.</param>
    /// <returns>True when well-formed.</returns>
    public static bool IsWellFormed(string value) => VerifierPattern().IsMatch(value);

    /// <summary>Checks a token request's verifier against the challenge stored with the code.</summary>
    /// <param name="challenge">The challenge from the authorize request.</param>
    /// <param name="method">Its method (<c>S256</c> or <c>plain</c>).</param>
    /// <param name="verifier">The <c>code_verifier</c> from the token request.</param>
    /// <returns>True when the verifier matches.</returns>
    public static bool Verify(string challenge, string method, string verifier)
    {
        var expected = string.Equals(method, S256, StringComparison.Ordinal)
            ? Base64Url.EncodeToString(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)))
            : verifier;

        // Constant-time compare: not essential for a dev emulator, but it is the correct habit for secrets.
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(challenge));
    }

    [GeneratedRegex("^[A-Za-z0-9._~-]{43,128}$", RegexOptions.CultureInvariant)]
    private static partial Regex VerifierPattern();
}
