using FleetConsole.Application.Credentials.Tokens;
using static FleetConsole.Application.Tests.Credentials.TestTokens;

namespace FleetConsole.Application.Tests.Credentials;

public sealed class TokenFingerprintsTests
{
    [Theory]
    // SHA-256("abc") = ba7816bf8f01cfea..., SHA-256("") = e3b0c44298fc1c14...
    [InlineData("abc", "ba7816bf")]
    [InlineData("", "e3b0c442")]
    public void Fingerprint_is_the_first_8_lowercase_hex_chars_of_sha256(string token, string expected)
    {
        TokenFingerprints.Compute(Sensitive(token)).Value.ShouldBe(expected);
    }

    [Fact]
    public void Different_tokens_have_different_fingerprints()
    {
        TokenFingerprints.Compute(Sensitive("sha256~fake-token-a")).ShouldNotBe(TokenFingerprints.Compute(Sensitive("sha256~fake-token-b")));
    }
}
