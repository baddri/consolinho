using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace FleetConsole.Infrastructure.Persistence.Converters;

// Single-value value objects are stored as one column. Reading goes through the Domain factory, so every materialized
// value satisfies the same rules as a new one; a stored value that no longer passes is corrupt data and throws (via
// ValueConverters.Valid) instead of silently producing an invalid object.

/// <summary>Stores a <see cref="Username"/> as its text.</summary>
internal sealed class UsernameConverter()
    : ValueConverter<Username, string>(name => name.Value, value => ValueConverters.Valid(Username.Create(value)));

/// <summary>Stores a <see cref="ClusterName"/> as its text.</summary>
internal sealed class ClusterNameConverter()
    : ValueConverter<ClusterName, string>(name => name.Value, value => ValueConverters.Valid(ClusterName.Create(value)));

/// <summary>Stores a <see cref="CredentialName"/> as its text.</summary>
internal sealed class CredentialNameConverter()
    : ValueConverter<CredentialName, string>(name => name.Value, value => ValueConverters.Valid(CredentialName.Create(value)));

/// <summary>Stores a <see cref="TokenFingerprint"/> as its 8 hex characters.</summary>
internal sealed class TokenFingerprintConverter()
    : ValueConverter<TokenFingerprint, string>(fingerprint => fingerprint.Value, value => ValueConverters.Valid(TokenFingerprint.Create(value)));

/// <summary>
/// Stores <see cref="InspectNamespaces"/> as a <c>text[]</c> of its names in order. Reading re-validates through
/// <see cref="InspectNamespaces.Create"/>. Always paired with <see cref="InspectNamespacesComparer"/>.
/// </summary>
internal sealed class InspectNamespacesConverter()
    : ValueConverter<InspectNamespaces, string[]>(
        namespaces => namespaces.Values.ToArray(),
        values => ValueConverters.Valid(InspectNamespaces.Create(values)));

/// <summary>
/// Change-tracking comparer for <see cref="InspectNamespaces"/>. Required: with an array provider type EF would otherwise
/// pick its list-of-strings comparer, which cannot snapshot the value object. The value object is immutable and compares
/// its names element-wise, so the snapshot is the instance itself and an equal list is not reported as modified.
/// </summary>
internal sealed class InspectNamespacesComparer()
    : ValueComparer<InspectNamespaces>((a, b) => object.Equals(a, b), namespaces => namespaces.GetHashCode(), namespaces => namespaces);

/// <summary>Stores an <see cref="EncryptedToken"/> as its ciphertext bytes (<c>bytea</c>).</summary>
internal sealed class EncryptedTokenConverter()
    : ValueConverter<EncryptedToken, byte[]>(token => token.Value, value => new EncryptedToken(value));

/// <summary>
/// Stores a <see cref="CaBundle"/> as its PEM text. Reading re-parses the certificates (<see cref="CaBundle.Create"/>):
/// cheap for the ~40 clusters, and keeps <see cref="CaBundle.Certificates"/> derived rather than stored.
/// </summary>
internal sealed class CaBundleConverter()
    : ValueConverter<CaBundle, string>(bundle => bundle.Pem, value => ValueConverters.Valid(CaBundle.Create(value)));

/// <summary>
/// Stores the API server URL in its canonical text form (<see cref="ApiServerEndpoint.ToString"/>: scheme + authority,
/// no trailing <c>/</c>), which is what the API returns. <see cref="Uri.ToString"/> would append a <c>/</c>.
/// </summary>
internal sealed class ApiUrlConverter()
    : ValueConverter<Uri, string>(url => url.GetLeftPart(UriPartial.Authority), value => new Uri(value, UriKind.Absolute));

/// <summary>
/// Stores a free-form absolute URL (the cluster's web console link) exactly as entered (<see cref="Uri.OriginalString"/>),
/// so it reads back unchanged and its length is the length the Domain validated against the column size.
/// </summary>
internal sealed class OriginalUriConverter()
    : ValueConverter<Uri, string>(url => url.OriginalString, value => new Uri(value, UriKind.Absolute));

/// <summary>Helpers shared by the converters' expression trees.</summary>
internal static class ValueConverters
{
    /// <summary>Unwraps a factory result read from the database, failing loudly when the stored value is invalid.</summary>
    /// <typeparam name="T">The value object type.</typeparam>
    /// <param name="result">The factory result.</param>
    /// <returns>The value object.</returns>
    /// <exception cref="InvalidOperationException">When the stored value violates the Domain rules (corrupt data).</exception>
    public static T Valid<T>(Result<T> result) =>
        result.IsSuccess
            ? result.Value
            : throw new InvalidOperationException(
                $"A stored {typeof(T).Name} is invalid ({result.Error.Code}); the database contains data the Domain rejects.");
}
