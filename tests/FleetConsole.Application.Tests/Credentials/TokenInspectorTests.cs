using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Domain.Credentials;
using static FleetConsole.Application.Tests.Credentials.TestTokens;

namespace FleetConsole.Application.Tests.Credentials;

public sealed class TokenInspectorTests
{
    [Fact]
    public void Jwt_with_sub_iat_exp_reports_all_claims()
    {
        var token = Jwt("""{"sub":"system:serviceaccount:fleet:viewer","iat":1763548200,"exp":1795084200}""");

        var metadata = TokenInspector.Inspect(Sensitive(token));

        metadata.ShouldBe(new TokenMetadata(
            TokenType.Jwt,
            "system:serviceaccount:fleet:viewer",
            DateTimeOffset.FromUnixTimeSeconds(1763548200),
            DateTimeOffset.FromUnixTimeSeconds(1795084200)));
    }

    [Fact]
    public void Jwt_without_claims_is_a_jwt_with_null_fields()
    {
        var metadata = TokenInspector.Inspect(Sensitive(Jwt("{}")));

        metadata.ShouldBe(new TokenMetadata(TokenType.Jwt, null, null, null));
        metadata.StatusAt(DateTimeOffset.UnixEpoch, TimeSpan.FromDays(14)).ShouldBe(CredentialExpiryStatus.NoExpiry);
    }

    [Fact]
    public void Jwt_with_empty_signature_segment_is_still_a_jwt()
    {
        TokenInspector.Inspect(Sensitive(Jwt("""{"sub":"x"}""", signature: ""))).Type.ShouldBe(TokenType.Jwt);
    }

    [Theory]
    [InlineData("sha256~abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG")]
    [InlineData("")]
    [InlineData("a.b")]
    [InlineData("a.b.c.d.e")]
    [InlineData("..")]
    [InlineData("!!!.???.sig")]
    [InlineData("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.not base64")]
    public void Malformed_segments_are_opaque(string token)
    {
        TokenInspector.Inspect(Sensitive(token)).ShouldBe(TokenMetadata.Opaque);
    }

    [Theory]
    [InlineData("not json", """{"sub":"x"}""")]
    [InlineData("""{"alg":"RS256"}""", "not json")]
    [InlineData("""["alg"]""", """{"sub":"x"}""")]
    [InlineData("""{"alg":"RS256"}""", "42")]
    [InlineData("""{"typ":"JWT"}""", """{"sub":"x"}""")]
    [InlineData("""{"alg":7}""", """{"sub":"x"}""")]
    [InlineData("{\"alg\":\"RS256\"", """{"sub":"x"}""")]
    public void Non_json_or_header_without_string_alg_is_opaque(string header, string payload)
    {
        TokenInspector.Inspect(Sensitive(Jwt(payload, header))).ShouldBe(TokenMetadata.Opaque);
    }

    [Theory]
    [InlineData("""{"exp":"1795084200"}""")]
    [InlineData("""{"exp":null}""")]
    [InlineData("""{"exp":1e300}""")]
    [InlineData("""{"exp":-1e300}""")]
    [InlineData("""{"exp":999999999999999}""")]
    public void Present_but_unreadable_exp_makes_the_token_opaque(string payload)
    {
        // Deliberate (T-0018 ruling): "unknown" is honest, "noExpiry" would hide a token that may well expire.
        TokenInspector.Inspect(Sensitive(Jwt(payload))).ShouldBe(TokenMetadata.Opaque);
    }

    [Fact]
    public void Fractional_numeric_dates_are_floored()
    {
        var metadata = TokenInspector.Inspect(Sensitive(Jwt("""{"iat":1763548200.9,"exp":1795084200.5}""")));

        metadata.IssuedAt.ShouldBe(DateTimeOffset.FromUnixTimeSeconds(1763548200));
        metadata.ExpiresAt.ShouldBe(DateTimeOffset.FromUnixTimeSeconds(1795084200));
    }

    [Fact]
    public void Zero_and_negative_numeric_dates_are_valid()
    {
        var metadata = TokenInspector.Inspect(Sensitive(Jwt("""{"iat":-60,"exp":0}""")));

        metadata.IssuedAt.ShouldBe(DateTimeOffset.UnixEpoch.AddSeconds(-60));
        metadata.ExpiresAt.ShouldBe(DateTimeOffset.UnixEpoch);
    }

    [Theory]
    [InlineData("""{"sub":"","iat":"yesterday"}""")]
    [InlineData("""{"sub":42,"iat":true}""")]
    [InlineData("""{"sub":null,"iat":1e300}""")]
    public void Invalid_sub_or_iat_become_null_but_keep_the_jwt(string payload)
    {
        TokenInspector.Inspect(Sensitive(Jwt(payload))).ShouldBe(new TokenMetadata(TokenType.Jwt, null, null, null));
    }

    [Fact]
    public void Deeply_nested_json_does_not_throw()
    {
        var nested = """{"sub":"x","n":""" + new string('[', 200) + new string(']', 200) + "}";

        TokenInspector.Inspect(Sensitive(Jwt(nested))).ShouldBe(TokenMetadata.Opaque);
    }
}
