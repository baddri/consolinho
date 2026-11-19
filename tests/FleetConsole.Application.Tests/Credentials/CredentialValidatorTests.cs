using FleetConsole.Application.Credentials.AddCredential;
using FleetConsole.Application.Credentials.RotateCredentialToken;
using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Domain.Credentials;
using static FleetConsole.Application.Tests.Credentials.TestTokens;

namespace FleetConsole.Application.Tests.Credentials;

public sealed class CredentialValidatorTests
{
    private const string ValidToken = "sha256~fake-test-token-0123456789";

    private static readonly AddCredentialValidator AddValidator = new();
    private static readonly RotateCredentialTokenValidator RotateValidator = new();

    [Fact]
    public void Valid_add_passes()
    {
        AddValidator.Validate(Add(token: ValidToken)).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("", "Token is required.")]
    [InlineData("abc def", "The token must not contain spaces or line breaks.")]
    [InlineData("abc\ndef", "The token must not contain spaces or line breaks.")]
    [InlineData("abc\tdef", "The token must not contain spaces or line breaks.")]
    [InlineData("abcé", "The token must contain only printable ASCII characters.")]
    [InlineData("abc\u0001", "The token must contain only printable ASCII characters.")]
    public void Token_rules_report_one_fixed_message(string token, string message)
    {
        var add = AddValidator.Validate(Add(token: token));
        var rotate = RotateValidator.Validate(new RotateCredentialTokenCommand("prod-eu-1", Guid.NewGuid(), Sensitive(token), 1));

        foreach (var result in new[] { add, rotate })
        {
            var error = result.Errors.ShouldHaveSingleItem();
            error.PropertyName.ShouldBe("Token");
            error.ErrorMessage.ShouldBe(message);
        }
    }

    [Fact]
    public void Token_of_exactly_16_KiB_passes_and_one_more_char_fails()
    {
        AddValidator.Validate(Add(token: new string('a', TokenValidationRules.MaxLength))).IsValid.ShouldBeTrue();

        var error = AddValidator.Validate(Add(token: new string('a', TokenValidationRules.MaxLength + 1))).Errors.ShouldHaveSingleItem();
        error.ErrorMessage.ShouldBe(TokenValidationRules.TooLongMessage);
    }

    [Fact]
    public void Messages_never_echo_the_token()
    {
        const string secret = "sha256~SECRET with space";

        var result = AddValidator.Validate(Add(token: secret));

        result.Errors.ShouldAllBe(e => !e.ErrorMessage.Contains("SECRET", StringComparison.Ordinal));
        result.Errors.ShouldAllBe(e => !(e.AttemptedValue ?? "").ToString()!.Contains("SECRET", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("")]
    [InlineData("Fleet-View")]
    [InlineData("-view")]
    public void Invalid_name_is_reported_on_name(string name)
    {
        AddValidator.Validate(Add(name: name)).Errors.ShouldContain(e => e.PropertyName == "Name");
    }

    [Fact]
    public void Description_longer_than_the_maximum_is_rejected()
    {
        AddValidator.Validate(Add(description: new string('d', Credential.MaxDescriptionLength))).IsValid.ShouldBeTrue();
        AddValidator.Validate(Add(description: new string('d', Credential.MaxDescriptionLength + 1)))
            .Errors.ShouldHaveSingleItem().ErrorMessage.ShouldBe(AddCredentialValidator.DescriptionTooLongMessage);
    }

    private static AddCredentialCommand Add(string name = "fleet-view", string? description = null, string token = ValidToken) =>
        new("prod-eu-1", name, description, Sensitive(token));
}
