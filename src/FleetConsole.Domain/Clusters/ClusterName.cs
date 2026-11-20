using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters;

/// <summary>
/// The name of a registered cluster (CLU-1): the slug in every cluster URL (<c>/api/admin/clusters/{name}</c>, and from
/// CP2 the proxy route), unique and immutable once the cluster is registered.
/// </summary>
/// <remarks>
/// Rules: a DNS label (lowercase letters, digits and <c>-</c>, starting and ending with a letter or digit) of at most
/// <see cref="MaxLength"/> characters. Input is not trimmed or lowercased: <c>Prod-EU</c> is invalid rather than silently
/// renamed. Instances only come from <see cref="Create"/>, so holding a <see cref="ClusterName"/> means the value is valid.
/// </remarks>
public sealed record ClusterName
{
    /// <summary>Maximum length of a cluster name; also the column length.</summary>
    public const int MaxLength = 40;

    private ClusterName(string value) => Value = value;

    /// <summary>The name, e.g. <c>prod-eu-1</c>.</summary>
    public string Value { get; }

    /// <summary>Validates <paramref name="value"/> against the cluster-name rules.</summary>
    /// <param name="value">The candidate name from a register request (or a route value being looked up).</param>
    /// <returns>The name, or a <see cref="ErrorType.Validation"/> error (<c>Clusters.InvalidName</c>) whose message is
    /// the contract's field message for <c>name</c>.</returns>
    public static Result<ClusterName> Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return ClusterErrors.InvalidName("Name is required.");
        }

        if (!DnsLabel.IsValid(value, MaxLength))
        {
            return ClusterErrors.InvalidName(
                $"Use lowercase letters, digits and '-' (max {MaxLength}), starting and ending with a letter or digit.");
        }

        return new ClusterName(value);
    }

    /// <summary>Returns the raw name, so it can be used directly in messages and logs.</summary>
    /// <returns><see cref="Value"/>.</returns>
    public override string ToString() => Value;
}
