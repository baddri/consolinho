using Microsoft.Extensions.Options;

namespace FleetConsole.DevOAuth.Configuration;

/// <summary>
/// Startup validation of <see cref="DevOAuthOptions"/>: at least one client, non-empty ids/secrets/names, and unique
/// client ids and usernames. A broken emulator config fails fast with a readable message instead of producing
/// confusing login failures in the Api.
/// </summary>
internal sealed class DevOAuthOptionsValidator : IValidateOptions<DevOAuthOptions>
{
    /// <inheritdoc />
    public ValidateOptionsResult Validate(string? name, DevOAuthOptions options)
    {
        var failures = new List<string>();

        if (options.Clients.Count == 0)
        {
            failures.Add("DevOAuth:Clients must contain at least one client.");
        }

        if (options.Clients.Any(client => string.IsNullOrWhiteSpace(client.ClientId) || string.IsNullOrWhiteSpace(client.ClientSecret)))
        {
            failures.Add("Every DevOAuth:Clients entry needs a ClientId and a ClientSecret.");
        }

        if (options.Users.Any(user => string.IsNullOrWhiteSpace(user.Name)))
        {
            failures.Add("Every DevOAuth:Users entry needs a Name.");
        }

        failures.AddRange(Duplicates(options.Clients.Select(client => client.ClientId))
            .Select(id => $"DevOAuth:Clients has duplicate ClientId '{id}'."));
        failures.AddRange(Duplicates(options.Users.Select(user => user.Name))
            .Select(userName => $"DevOAuth:Users has duplicate Name '{userName}'."));

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    // Ordinal comparison: OpenShift usernames and client ids are case-sensitive.
    private static IEnumerable<string> Duplicates(IEnumerable<string> values) =>
        values.Where(value => !string.IsNullOrWhiteSpace(value))
            .GroupBy(value => value, StringComparer.Ordinal)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key);
}
