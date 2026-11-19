using FleetConsole.Application.Credentials.ConnectionTesting;
using FluentValidation;

namespace FleetConsole.Application.Credentials.TestCredential;

/// <summary>Field rules of <see cref="TestCredentialCommand"/> (contract §8.4).</summary>
internal sealed class TestCredentialValidator : AbstractValidator<TestCredentialCommand>
{
    /// <summary>Defines the rules.</summary>
    public TestCredentialValidator() => RuleFor(c => c.InspectNamespace).ValidInspectNamespace();
}
