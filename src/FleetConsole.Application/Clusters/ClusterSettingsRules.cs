using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FluentValidation;

namespace FleetConsole.Application.Clusters;

/// <summary>
/// The field rules of contract §8.2 shared by the register and update validators. Connection rules (API URL, CA bundle,
/// skip TLS) are not restated here: they come from <see cref="ApiServerEndpoint.Create"/>, whose field errors are copied
/// unchanged, so the Domain stays the single source of those rules (https-only, no private key in the bundle, size in
/// UTF-8 bytes, …).
/// </summary>
/// <remarks>
/// Display name, web console URL and description must be rejected here: <see cref="Cluster.Register"/> and
/// <see cref="Cluster.Update"/> treat bad values as programming errors and throw.
/// </remarks>
internal static class ClusterSettingsRules
{
    /// <summary>Adds the shared rules to <paramref name="validator"/>.</summary>
    /// <typeparam name="T">The command type.</typeparam>
    /// <param name="validator">The command's validator.</param>
    public static void AddClusterSettingsRules<T>(this AbstractValidator<T> validator)
        where T : IClusterSettings
    {
        validator.RuleFor(x => x.DisplayName)
            .Must(value => (ClusterSettingsInput.Text(value)?.Length ?? 0) <= Cluster.MaxDisplayNameLength)
            .WithMessage($"Display name must be at most {Cluster.MaxDisplayNameLength} characters long.");

        validator.RuleFor(x => x.Environment)
            .IsInEnum()
            .WithMessage("Choose production, staging or development.");

        validator.RuleFor(x => x.WebConsoleUrl)
            .Must(value => ClusterSettingsInput.TryParseWebConsoleUrl(value, out _))
            .WithMessage($"Web console URL must be an absolute https:// URL of at most {Cluster.MaxWebConsoleUrlLength} characters.");

        validator.RuleFor(x => x.Description)
            .Must(value => (ClusterSettingsInput.Text(value)?.Length ?? 0) <= Cluster.MaxDescriptionLength)
            .WithMessage($"Description must be at most {Cluster.MaxDescriptionLength} characters long.");

        // One rule for the three connection fields: the value object validates them together (skip TLS + CA bundle are
        // exclusive) and reports each problem under its own JSON field name.
        validator.RuleFor(x => x.ApiUrl).Custom((_, context) =>
        {
            var endpoint = ClusterSettingsInput.Endpoint(context.InstanceToValidate);
            if (endpoint.IsSuccess)
            {
                return;
            }

            if (endpoint.Error is not ValidationError fieldErrors)
            {
                throw new InvalidOperationException($"ApiServerEndpoint.Create returned a non-field error '{endpoint.Error.Code}'.");
            }

            foreach (var (field, messages) in fieldErrors.Errors)
            {
                foreach (var message in messages)
                {
                    context.AddFailure(field, message);
                }
            }
        });
    }
}
