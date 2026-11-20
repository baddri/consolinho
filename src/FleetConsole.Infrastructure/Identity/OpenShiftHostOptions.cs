namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// How to reach the host cluster (the cluster FleetConsole runs on) for login: its API server (<c>users/~</c>, OAuth
/// discovery), the OAuth client credentials and TLS trust. Configuration section <c>Auth:OpenShift</c> (contract §12,
/// ADR-0007/0010); validated at startup by <see cref="OpenShiftHostOptionsValidator"/>.
/// </summary>
public sealed class OpenShiftHostOptions
{
    /// <summary>The configuration section name.</summary>
    public const string SectionName = "Auth:OpenShift";

    /// <summary>
    /// Host cluster API server, e.g. <c>https://api.host.example.com:6443</c> (required; in development the DevOAuth
    /// emulator's URL). A path prefix is kept: requests resolve relative to it.
    /// </summary>
    public Uri? HostApiServerUrl { get; set; }

    /// <summary>OAuth client id (production: the name of the console's <c>OAuthClient</c>, <c>consolinho</c>; ADR-0030). Required.</summary>
    public string? ClientId { get; set; }

    /// <summary>OAuth client secret (production: the <c>OAuthClient</c>'s secret, from a Secret). Required; never logged.</summary>
    public string? ClientSecret { get; set; }

    /// <summary>Optional static authorization endpoint; together with <see cref="TokenEndpoint"/> it skips discovery.</summary>
    public Uri? AuthorizationEndpoint { get; set; }

    /// <summary>Optional static token endpoint; together with <see cref="AuthorizationEndpoint"/> it skips discovery.</summary>
    public Uri? TokenEndpoint { get; set; }

    /// <summary>
    /// PEM file with the CA certificate(s) to trust for the host API server <em>and</em> the OAuth server, instead of
    /// the system trust store (in-cluster typically the ServiceAccount <c>ca.crt</c>, possibly concatenated with the
    /// ingress CA if the OAuth route uses it). <see langword="null"/> = system trust.
    /// </summary>
    public string? CaBundlePath { get; set; }

    /// <summary>Accept any server certificate. Development only: startup fails in any other environment.</summary>
    public bool SkipTlsVerify { get; set; }

    /// <summary>Both static endpoints are configured, so discovery is skipped.</summary>
    internal bool HasStaticEndpoints => AuthorizationEndpoint is not null && TokenEndpoint is not null;
}
