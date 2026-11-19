using FleetConsole.Application.Credentials.Tokens;
using FluentValidation;

namespace FleetConsole.Application.Credentials.RotateCredentialToken;

/// <summary>Field rules of <see cref="RotateCredentialTokenCommand"/>: the shared token rules (contract §8.4).</summary>
internal sealed class RotateCredentialTokenValidator : AbstractValidator<RotateCredentialTokenCommand>
{
    /// <summary>Defines the rules.</summary>
    public RotateCredentialTokenValidator() => RuleFor(c => c.Token).ValidToken();
}
