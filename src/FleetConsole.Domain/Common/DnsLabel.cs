using System.Text.RegularExpressions;

namespace FleetConsole.Domain.Common;

/// <summary>
/// The RFC 1123 DNS-label rule shared by the natural keys that appear in URLs (cluster names, credential names):
/// lowercase letters, digits and <c>-</c>, starting and ending with a letter or digit. Keeping the pattern in one
/// place means <c>ClusterName</c> and <c>CredentialName</c> cannot drift apart.
/// </summary>
internal static partial class DnsLabel
{
    /// <summary>Whether <paramref name="value"/> is a DNS label of at most <paramref name="maxLength"/> characters.</summary>
    /// <param name="value">The candidate, not trimmed or lowercased (callers reject anything that is not already canonical).</param>
    /// <param name="maxLength">Inclusive maximum length (40 for clusters, 63 for credentials).</param>
    /// <returns><see langword="true"/> when the value matches the rule.</returns>
    public static bool IsValid(string value, int maxLength) =>
        value.Length <= maxLength && Pattern().IsMatch(value);

    // \z rather than $ so a trailing newline is not accepted.
    [GeneratedRegex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?\\z", RegexOptions.CultureInvariant)]
    private static partial Regex Pattern();
}
