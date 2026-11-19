using System.Buffers.Text;
using System.Text;
using FleetConsole.Application.Abstractions;

namespace FleetConsole.Application.Tests.Credentials;

/// <summary>
/// Builds obviously fake tokens for the credential tests: unsigned JWTs with chosen claims (the inspector never
/// validates signatures) and opaque OpenShift-style tokens.
/// </summary>
internal static class TestTokens
{
    /// <summary>A JWT whose header and payload are the given raw JSON texts, with a fake signature segment.</summary>
    public static string Jwt(string payloadJson, string headerJson = """{"alg":"RS256","kid":"fake"}""", string signature = "ZmFrZS1zaWc") =>
        $"{Segment(headerJson)}.{Segment(payloadJson)}.{signature}";

    /// <summary>The base64url encoding (no padding) of a UTF-8 text.</summary>
    public static string Segment(string text) => Base64Url.EncodeToString(Encoding.UTF8.GetBytes(text));

    /// <summary>Wraps a plaintext as the handlers receive it.</summary>
    public static SensitiveString Sensitive(string token) => new(token);
}
