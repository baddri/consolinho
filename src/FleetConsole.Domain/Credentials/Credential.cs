using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials.Events;

namespace FleetConsole.Domain.Credentials;

/// <summary>
/// A ServiceAccount token an admin stored for one cluster (CRED-*). Grants hand it to users: every proxied request of a
/// granted user is sent with this credential's token. The aggregate holds only the encrypted token plus display data
/// (fingerprint, JWT metadata, last connection test summary).
/// </summary>
/// <remarks>
/// <para><b>No plaintext (CRED-2).</b> The token arrives already encrypted (<see cref="EncryptedToken"/>) together with the
/// fingerprint and metadata the Application layer derived from the plaintext.</para>
/// <para><b>Belongs to one cluster.</b> <see cref="ClusterId"/> is fixed at creation; a grant may only use a credential of
/// its own cluster (GRANT-1).</para>
/// <para><b>Cluster name in events.</b> Audit entries carry the cluster name, which this aggregate does not own, so the
/// methods that raise events take it as an argument (the handler has the cluster loaded anyway).</para>
/// </remarks>
public sealed class Credential : AggregateRoot<CredentialId>
{
    /// <summary>Maximum length of <see cref="Description"/>; also the column length.</summary>
    public const int MaxDescriptionLength = 1000;

    /// <summary>Parameterless constructor for EF Core materialization only.</summary>
    private Credential()
    {
    }

    private Credential(CredentialId id, ClusterId clusterId, CredentialName name, string createdBy, DateTimeOffset createdAt)
        : base(id)
    {
        ClusterId = clusterId;
        Name = name;
        CreatedBy = createdBy;
        CreatedAt = createdAt;
    }

    /// <summary>The cluster this credential belongs to. Immutable.</summary>
    public ClusterId ClusterId { get; private init; }

    /// <summary>The credential's name, unique within its cluster. Immutable in CP1.</summary>
    public CredentialName Name { get; private init; } = null!;

    /// <summary>Optional free-text description for admins.</summary>
    public string? Description { get; private set; }

    /// <summary>The encrypted token. Decrypted only in the Application layer, for the duration of a request.</summary>
    public EncryptedToken Token { get; private set; } = null!;

    /// <summary>Fingerprint of the current token (ADR-0004).</summary>
    public TokenFingerprint Fingerprint { get; private set; } = null!;

    /// <summary>Display metadata of the current token (type, subject, issued/expiry times).</summary>
    public TokenMetadata Metadata { get; private set; } = null!;

    /// <summary>When the credential was added.</summary>
    public DateTimeOffset CreatedAt { get; private init; }

    /// <summary>Username of the admin who added the credential.</summary>
    public string CreatedBy { get; private init; } = null!;

    /// <summary>When the token was last rotated; <see langword="null"/> if never.</summary>
    public DateTimeOffset? RotatedAt { get; private set; }

    /// <summary>Username of the admin who last rotated the token; <see langword="null"/> if never.</summary>
    public string? RotatedBy { get; private set; }

    /// <summary>
    /// Summary of the last connection test of the <em>current</em> token (TEST-5); <see langword="null"/> when it was never
    /// tested. Whether it is stale is decided against the cluster's <c>ConnectionSettingsChangedAt</c>.
    /// </summary>
    public ConnectionTestSummary? LastTest { get; private set; }

    /// <summary>Adds a credential to <paramref name="cluster"/> (CRED-1). Raises <see cref="CredentialAdded"/>.</summary>
    /// <remarks>Allowed on disabled clusters: admins set up and test credentials before enabling a cluster.</remarks>
    /// <param name="cluster">The cluster the credential belongs to.</param>
    /// <param name="name">The credential name; uniqueness within the cluster is checked by the handler.</param>
    /// <param name="description">Optional description; blank is stored as <see langword="null"/>.</param>
    /// <param name="token">The encrypted token.</param>
    /// <param name="fingerprint">The fingerprint of the plaintext token.</param>
    /// <param name="metadata">The token's display metadata.</param>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>The new credential.</returns>
    public static Credential Add(
        Cluster cluster,
        CredentialName name,
        string? description,
        EncryptedToken token,
        TokenFingerprint fingerprint,
        TokenMetadata metadata,
        string actor,
        DateTimeOffset now)
    {
        Guard.NotNull(cluster);
        Guard.NotNull(name);
        Guard.NotNull(token);
        Guard.NotNull(fingerprint);
        Guard.NotNull(metadata);
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);

        var credential = new Credential(CredentialId.New(), cluster.Id, name, actor, now)
        {
            Description = string.IsNullOrWhiteSpace(description) ? null : Guard.MaxLength(description, MaxDescriptionLength),
            Token = token,
            Fingerprint = fingerprint,
            Metadata = metadata,
        };
        credential.RaiseDomainEvent(new CredentialAdded(
            credential.Id, cluster.Id, cluster.Name.Value, name.Value, fingerprint.Value, metadata.Type,
            metadata.ServiceAccount));
        return credential;
    }

    /// <summary>
    /// Replaces the token in place (CRED-5): same id, grants unchanged. <see cref="LastTest"/> is cleared because it
    /// described the old token. Raises <see cref="CredentialRotated"/>.
    /// </summary>
    /// <remarks>
    /// Not idempotent: the Domain cannot compare plaintext tokens (the ciphertext differs on every encryption, and equal
    /// 8-character fingerprints do not prove equal tokens), so every rotation is a change and is audited.
    /// </remarks>
    /// <param name="token">The new encrypted token.</param>
    /// <param name="fingerprint">The new token's fingerprint.</param>
    /// <param name="metadata">The new token's display metadata.</param>
    /// <param name="clusterName">The name of the credential's cluster, for the audit entry.</param>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    public void Rotate(
        EncryptedToken token,
        TokenFingerprint fingerprint,
        TokenMetadata metadata,
        string clusterName,
        string actor,
        DateTimeOffset now)
    {
        Guard.NotNull(token);
        Guard.NotNull(fingerprint);
        Guard.NotNull(metadata);
        Guard.NotNullOrWhiteSpace(clusterName);
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);

        var oldFingerprint = Fingerprint;
        Token = token;
        Fingerprint = fingerprint;
        Metadata = metadata;
        RotatedAt = now;
        RotatedBy = actor;
        LastTest = null;
        RaiseDomainEvent(new CredentialRotated(Id, ClusterId, clusterName, Name.Value, oldFingerprint.Value, fingerprint.Value));
    }

    /// <summary>
    /// Stores the summary of a connection test of the current token (TEST-5), replacing the previous one. Raises
    /// <see cref="CredentialTested"/> every time: each test run is audited.
    /// </summary>
    /// <param name="summary">The test summary; <c>FailedStep</c> must be set exactly when the test failed.</param>
    /// <param name="clusterName">The name of the credential's cluster, for the audit entry.</param>
    public void RecordTest(ConnectionTestSummary summary, string clusterName)
    {
        Guard.NotNull(summary);
        Guard.NotNullOrWhiteSpace(clusterName);
        Guard.NotDefault(summary.TestedAt);
        if (summary.Succeeded != (summary.FailedStep is null))
        {
            throw new ArgumentException("A test summary has a failed step exactly when it did not succeed.", nameof(summary));
        }

        LastTest = summary;
        RaiseDomainEvent(new CredentialTested(
            Id, ClusterId, clusterName, Name.Value, summary.Succeeded, summary.FailedStep, summary.Headline));
    }

    /// <summary>
    /// Checks that the credential may be deleted (CRED-6: no grant uses it) and raises <see cref="CredentialDeleted"/>.
    /// The handler then removes the aggregate.
    /// </summary>
    /// <param name="grantCount">Number of grants using this credential (read by the handler).</param>
    /// <param name="clusterName">The name of the credential's cluster, for the audit entry.</param>
    /// <returns>Success, or <see cref="CredentialErrors.InUse"/> while grants use it (no event then).</returns>
    public Result MarkForDeletion(int grantCount, string clusterName)
    {
        Guard.InRange(grantCount, 0, int.MaxValue);
        Guard.NotNullOrWhiteSpace(clusterName);

        if (grantCount > 0)
        {
            return CredentialErrors.InUse(Name.Value, grantCount);
        }

        RaiseDomainEvent(new CredentialDeleted(Id, ClusterId, clusterName, Name.Value, Fingerprint.Value));
        return Result.Success();
    }
}
