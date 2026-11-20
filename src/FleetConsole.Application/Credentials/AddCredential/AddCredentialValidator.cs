using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Domain.Credentials;
using FluentValidation;

namespace FleetConsole.Application.Credentials.AddCredential;

/// <summary>
/// Field rules of <see cref="AddCredentialCommand"/> (contract §8.4, CRED-1). The name rules are the Domain's
/// (<see cref="CredentialName.Create"/>), so its message lands on <c>name</c>; uniqueness is the handler's 409.
/// </summary>
internal sealed class AddCredentialValidator : AbstractValidator<AddCredentialCommand>
{
    /// <summary>Message when the description is too long.</summary>
    public static readonly string DescriptionTooLongMessage =
        $"Description must be at most {Credential.MaxDescriptionLength} characters long.";

    /// <summary>Defines the rules.</summary>
    public AddCredentialValidator()
    {
        RuleFor(c => c.Name).Custom((name, context) =>
        {
            var result = CredentialName.Create(name);
            if (result.IsFailure)
            {
                context.AddFailure(nameof(AddCredentialCommand.Name), result.Error.Message);
            }
        });

        RuleFor(c => c.Description)
            .Must(description => description is null || description.Length <= Credential.MaxDescriptionLength)
            .WithMessage(DescriptionTooLongMessage);

        RuleFor(c => c.Token).ValidToken();
    }
}
