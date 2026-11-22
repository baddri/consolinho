using FleetConsole.Application.Credentials.Tokens;
using FluentValidation;

namespace FleetConsole.Application.Credentials.TestToken;

/// <summary>Field rules of <see cref="TestTokenCommand"/>: the shared token rules and the namespace rule (contract §8.4).</summary>
internal sealed class TestTokenValidator : AbstractValidator<TestTokenCommand>
{
    /// <summary>Defines the rules.</summary>
    public TestTokenValidator()
    {
        RuleFor(c => c.Token).ValidToken();
        RuleFor(c => c.InspectNamespaces).ValidInspectNamespaces();
    }
}
