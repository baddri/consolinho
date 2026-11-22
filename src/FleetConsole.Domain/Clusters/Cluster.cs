using FleetConsole.Domain.Clusters.Events;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Clusters;

/// <summary>
/// An OpenShift cluster registered for FleetConsole to proxy to (CLU-*). The aggregate owns the cluster's identity
/// (<see cref="Name"/>), connection settings (<see cref="Endpoint"/>), presentation (display name, environment, links)
/// and its lifecycle (enabled, disabled, deleted). Credentials and grants are separate aggregates that reference the
/// cluster by <see cref="ClusterId"/>.
/// </summary>
/// <remarks>
/// <para><b>Immutable name.</b> <see cref="Name"/> is the URL slug and natural key; it is set once by
/// <see cref="Register"/> and no method changes it (CLU-1).</para>
/// <para><b>Stale tests (CLU-4).</b> <see cref="ConnectionSettingsChangedAt"/> moves whenever the endpoint changes; a
/// credential's stored test result older than it is reported as stale. Other edits leave it alone.</para>
/// <para><b>Idempotency.</b> <see cref="Update"/> with identical values, <see cref="Enable"/> on an enabled and
/// <see cref="Disable"/> on a disabled cluster change nothing and raise no event, so they produce no audit entry
/// (ADR-0013 §3).</para>
/// <para><b>Deletion (CLU-6)</b> is decided here (<see cref="MarkForDeletion"/>) and carried out by the repository;
/// the database cascades to the cluster's credentials and grants.</para>
/// </remarks>
public sealed class Cluster : AggregateRoot<ClusterId>
{
    /// <summary>Maximum length of <see cref="DisplayName"/>; also the column length.</summary>
    public const int MaxDisplayNameLength = 100;

    /// <summary>Maximum length of <see cref="Description"/>; also the column length.</summary>
    public const int MaxDescriptionLength = 1000;

    /// <summary>Maximum length of <see cref="WebConsoleUrl"/>; also the column length.</summary>
    public const int MaxWebConsoleUrlLength = 2048;

    /// <summary>Parameterless constructor for EF Core materialization only.</summary>
    private Cluster()
    {
    }

    private Cluster(ClusterId id, ClusterName name, string createdBy, DateTimeOffset createdAt)
        : base(id)
    {
        Name = name;
        CreatedBy = createdBy;
        CreatedAt = createdAt;
    }

    /// <summary>The cluster name: URL slug and natural key, unique and immutable.</summary>
    public ClusterName Name { get; private init; } = null!;

    /// <summary>Human-friendly name for the switcher and admin pages; defaults to <see cref="Name"/> when none is given.</summary>
    public string DisplayName { get; private set; } = null!;

    /// <summary>The API server URL and TLS verification settings.</summary>
    public ApiServerEndpoint Endpoint { get; private set; } = null!;

    /// <summary>Production, staging or development (Q5).</summary>
    public ClusterEnvironment Environment { get; private set; }

    /// <summary>
    /// The admin-declared distribution (DIST-1): presentation only (tag and theme in the SPA, ADR-0032); never used to
    /// decide which features or APIs are available.
    /// </summary>
    public ClusterDistribution Distribution { get; private set; }

    /// <summary>Optional <c>https://</c> link to the cluster's own web console (link-out only).</summary>
    public Uri? WebConsoleUrl { get; private set; }

    /// <summary>Optional free-text description for admins.</summary>
    public string? Description { get; private set; }

    /// <summary>Whether users see the cluster in the switcher and may use their grants on it (CLU-5).</summary>
    public bool IsEnabled { get; private set; }

    /// <summary>
    /// When <see cref="Endpoint"/> last changed (registration counts). Credential test results recorded before this time
    /// are stale (CLU-4).
    /// </summary>
    public DateTimeOffset ConnectionSettingsChangedAt { get; private set; }

    /// <summary>When the cluster was registered.</summary>
    public DateTimeOffset CreatedAt { get; private init; }

    /// <summary>Username of the admin who registered the cluster.</summary>
    public string CreatedBy { get; private init; } = null!;

    /// <summary>When an admin last changed the cluster (edit, enable, disable); <see langword="null"/> if never.</summary>
    public DateTimeOffset? UpdatedAt { get; private set; }

    /// <summary>Username of the admin who last changed the cluster; <see langword="null"/> if never.</summary>
    public string? UpdatedBy { get; private set; }

    /// <summary>Registers a cluster (CLU-1). Raises <see cref="ClusterRegistered"/>.</summary>
    /// <param name="name">The cluster name; uniqueness is checked by the handler.</param>
    /// <param name="displayName">Display name; null or blank defaults to <paramref name="name"/>.</param>
    /// <param name="endpoint">The validated connection settings.</param>
    /// <param name="environment">The environment classification.</param>
    /// <param name="distribution">The admin-declared distribution (presentation only, ADR-0032).</param>
    /// <param name="webConsoleUrl">Optional absolute <c>https://</c> console URL (validated by the request validator).</param>
    /// <param name="description">Optional description; blank is stored as <see langword="null"/>.</param>
    /// <param name="isEnabled">Whether the cluster is immediately visible to granted users.</param>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    /// <returns>The new cluster.</returns>
    public static Cluster Register(
        ClusterName name,
        string? displayName,
        ApiServerEndpoint endpoint,
        ClusterEnvironment environment,
        ClusterDistribution distribution,
        Uri? webConsoleUrl,
        string? description,
        bool isEnabled,
        string actor,
        DateTimeOffset now)
    {
        Guard.NotNull(name);
        Guard.NotNull(endpoint);
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);

        var cluster = new Cluster(ClusterId.New(), name, actor, now)
        {
            DisplayName = NormalizeDisplayName(displayName, name),
            Endpoint = endpoint,
            Environment = CheckEnvironment(environment),
            Distribution = CheckDistribution(distribution),
            WebConsoleUrl = CheckWebConsoleUrl(webConsoleUrl),
            Description = NormalizeDescription(description),
            IsEnabled = isEnabled,
            ConnectionSettingsChangedAt = now,
        };
        cluster.RaiseDomainEvent(new ClusterRegistered(
            cluster.Id, name.Value, cluster.Environment, cluster.Distribution, endpoint.ToString(), endpoint.TlsMode, isEnabled));
        return cluster;
    }

    /// <summary>
    /// Replaces every editable setting (CLU-4; the name is not editable). Raises <see cref="ClusterUpdated"/> listing the
    /// changed fields, or nothing when no value changed. An endpoint change moves
    /// <see cref="ConnectionSettingsChangedAt"/> to <paramref name="now"/>.
    /// </summary>
    /// <param name="displayName">Display name; null or blank defaults to <see cref="Name"/>.</param>
    /// <param name="endpoint">The validated connection settings.</param>
    /// <param name="environment">The environment classification.</param>
    /// <param name="distribution">The admin-declared distribution; a change does not mark connection tests stale.</param>
    /// <param name="webConsoleUrl">Optional absolute <c>https://</c> console URL.</param>
    /// <param name="description">Optional description; blank is stored as <see langword="null"/>.</param>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    public void Update(
        string? displayName,
        ApiServerEndpoint endpoint,
        ClusterEnvironment environment,
        ClusterDistribution distribution,
        Uri? webConsoleUrl,
        string? description,
        string actor,
        DateTimeOffset now)
    {
        Guard.NotNull(endpoint);
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);

        var newDisplayName = NormalizeDisplayName(displayName, Name);
        var newEnvironment = CheckEnvironment(environment);
        var newDistribution = CheckDistribution(distribution);
        var newWebConsoleUrl = CheckWebConsoleUrl(webConsoleUrl);
        var newDescription = NormalizeDescription(description);

        // Field names are the camelCase request/JSON names, in the order of UpdateClusterRequest, because the audit entry
        // shows them to admins as "changed fields". URLs are compared by their canonical text (Uri equality ignores
        // some differences the admin would consider a change, e.g. user info).
        var changedFields = new List<string>();
        if (!string.Equals(DisplayName, newDisplayName, StringComparison.Ordinal))
        {
            changedFields.Add("displayName");
        }

        if (!string.Equals(Endpoint.ToString(), endpoint.ToString(), StringComparison.Ordinal))
        {
            changedFields.Add("apiUrl");
        }

        if (Environment != newEnvironment)
        {
            changedFields.Add("environment");
        }

        if (Distribution != newDistribution)
        {
            changedFields.Add("distribution");
        }

        if (!string.Equals(WebConsoleUrl?.ToString(), newWebConsoleUrl?.ToString(), StringComparison.Ordinal))
        {
            changedFields.Add("webConsoleUrl");
        }

        if (!string.Equals(Description, newDescription, StringComparison.Ordinal))
        {
            changedFields.Add("description");
        }

        if (Endpoint.CaBundle != endpoint.CaBundle)
        {
            changedFields.Add("caBundle");
        }

        if (Endpoint.SkipTlsVerify != endpoint.SkipTlsVerify)
        {
            changedFields.Add("skipTlsVerify");
        }

        if (changedFields.Count == 0)
        {
            return;
        }

        if (changedFields.Contains("apiUrl") || changedFields.Contains("caBundle") || changedFields.Contains("skipTlsVerify"))
        {
            ConnectionSettingsChangedAt = now;
        }

        DisplayName = newDisplayName;
        Endpoint = endpoint;
        Environment = newEnvironment;
        Distribution = newDistribution;
        WebConsoleUrl = newWebConsoleUrl;
        Description = newDescription;
        Touch(actor, now);
        RaiseDomainEvent(new ClusterUpdated(Id, Name.Value, changedFields.AsReadOnly()));
    }

    /// <summary>
    /// Makes the cluster available to granted users again (CLU-5). Raises <see cref="ClusterEnabled"/> unless it is
    /// already enabled.
    /// </summary>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    public void Enable(string actor, DateTimeOffset now)
    {
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);

        if (IsEnabled)
        {
            return;
        }

        IsEnabled = true;
        Touch(actor, now);
        RaiseDomainEvent(new ClusterEnabled(Id, Name.Value));
    }

    /// <summary>
    /// Hides the cluster from the switcher and stops access through it (CLU-5); grants and credentials are kept. Raises
    /// <see cref="ClusterDisabled"/> unless it is already disabled.
    /// </summary>
    /// <param name="actor">Username of the acting admin.</param>
    /// <param name="now">Current time (from <c>IClock</c>).</param>
    public void Disable(string actor, DateTimeOffset now)
    {
        Guard.NotNullOrWhiteSpace(actor);
        Guard.NotDefault(now);

        if (!IsEnabled)
        {
            return;
        }

        IsEnabled = false;
        Touch(actor, now);
        RaiseDomainEvent(new ClusterDisabled(Id, Name.Value));
    }

    /// <summary>
    /// Checks that the cluster may be deleted (CLU-6: only when disabled) and raises <see cref="ClusterDeleted"/> with the
    /// counts that the deletion removes. The handler then removes the aggregate; the database cascades to credentials and
    /// grants.
    /// </summary>
    /// <param name="credentialCount">Number of credentials of this cluster (read by the handler).</param>
    /// <param name="grantCount">Number of grants on this cluster (read by the handler).</param>
    /// <returns>Success, or <see cref="ClusterErrors.NotDisabled"/> while the cluster is enabled (no event then).</returns>
    public Result MarkForDeletion(int credentialCount, int grantCount)
    {
        Guard.InRange(credentialCount, 0, int.MaxValue);
        Guard.InRange(grantCount, 0, int.MaxValue);

        if (IsEnabled)
        {
            return ClusterErrors.NotDisabled(Name.Value);
        }

        RaiseDomainEvent(new ClusterDeleted(Id, Name.Value, credentialCount, grantCount));
        return Result.Success();
    }

    private void Touch(string actor, DateTimeOffset now)
    {
        UpdatedAt = now;
        UpdatedBy = actor;
    }

    private static string NormalizeDisplayName(string? displayName, ClusterName name) =>
        string.IsNullOrWhiteSpace(displayName) ? name.Value : Guard.MaxLength(displayName, MaxDisplayNameLength);

    private static string? NormalizeDescription(string? description) =>
        string.IsNullOrWhiteSpace(description) ? null : Guard.MaxLength(description, MaxDescriptionLength);

    private static ClusterEnvironment CheckEnvironment(ClusterEnvironment environment) =>
        Enum.IsDefined(environment)
            ? environment
            : throw new ArgumentOutOfRangeException(nameof(environment), environment, "Unknown cluster environment.");

    private static ClusterDistribution CheckDistribution(ClusterDistribution distribution) =>
        Enum.IsDefined(distribution)
            ? distribution
            : throw new ArgumentOutOfRangeException(nameof(distribution), distribution, "Unknown cluster distribution.");

    private static Uri? CheckWebConsoleUrl(Uri? webConsoleUrl)
    {
        // The request validator turns bad input into a field error; reaching here with a bad URL is a bug.
        if (webConsoleUrl is not null
            && (!webConsoleUrl.IsAbsoluteUri
                || webConsoleUrl.Scheme != Uri.UriSchemeHttps
                || webConsoleUrl.OriginalString.Length > MaxWebConsoleUrlLength))
        {
            throw new ArgumentException("The web console URL must be an absolute https:// URL.", nameof(webConsoleUrl));
        }

        return webConsoleUrl;
    }
}
