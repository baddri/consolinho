using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// Startup validation of <see cref="HostGroupsOptions"/>. Messages name keys, never values (the token especially).
/// </summary>
/// <remarks>
/// An inline token outside Development would put a long-lived host credential into configuration (env vars, ConfigMaps)
/// instead of a mounted, rotating projected token, so it is refused there (ADR-0039 §5).
/// </remarks>
/// <param name="environment">Decides whether <see cref="HostGroupsOptions.Token"/> is allowed.</param>
internal sealed class HostGroupsOptionsValidator(IHostEnvironment environment) : IValidateOptions<HostGroupsOptions>
{
    /// <inheritdoc />
    public ValidateOptionsResult Validate(string? name, HostGroupsOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var failures = new List<string>();
        const string Prefix = HostGroupsOptions.SectionName;

        if (!string.IsNullOrEmpty(options.Token) && !environment.IsDevelopment())
        {
            failures.Add($"{Prefix}:Token is only allowed in Development; mount the host ServiceAccount token at {Prefix}:TokenPath.");
        }

        if (string.IsNullOrEmpty(options.Token) && string.IsNullOrWhiteSpace(options.TokenPath))
        {
            failures.Add($"{Prefix}:TokenPath must not be empty.");
        }

        if (options.MaxSnapshotAge <= TimeSpan.Zero || options.MaxSnapshotAge > HostGroupsOptions.MaxAllowedSnapshotAge)
        {
            failures.Add($"{Prefix}:MaxSnapshotAge must be greater than zero and at most {HostGroupsOptions.MaxAllowedSnapshotAge:c}.");
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }
}
