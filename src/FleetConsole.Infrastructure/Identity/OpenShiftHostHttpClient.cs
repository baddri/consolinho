using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// The named <see cref="HttpClient"/> for everything FleetConsole sends to the host cluster during login: OAuth
/// discovery, the token request (the Api's OAuth backchannel, T-0015) and <c>users/~</c> (ADR-0010).
/// </summary>
/// <remarks>
/// <para><b>No resilience handlers.</b> ServiceDefaults adds the standard resilience handler (retries, circuit breaker)
/// to every factory client. This client opts out entirely (<c>RemoveAllResilienceHandlers</c>, orchestrator ruling
/// T-0014): a retried token POST would redeem the single-use authorization code twice, and the server consumes a code
/// on any attempt, so the retry fails and the login with it. GETs lose retries too, deliberately: discovery has its own
/// 10-second retry window, and a failed <c>users/~</c> ends as "unavailable" and the user simply logs in again.</para>
/// <para><b>Timeout</b> <see cref="Timeout"/> per request, set on the client.</para>
/// <para><b>TLS:</b> <see cref="OpenShiftHostOptions.CaBundlePath"/> replaces the system trust store
/// (<see cref="X509ChainTrustMode.CustomRootTrust"/>, no revocation check: cluster CAs publish none);
/// <see cref="OpenShiftHostOptions.SkipTlsVerify"/> (Development only) accepts any certificate. Redirects are not
/// followed and no cookies are kept.</para>
/// </remarks>
public static class OpenShiftHostHttpClient
{
    /// <summary>The <c>IHttpClientFactory</c> name; the Api's OAuth handler uses it as its backchannel.</summary>
    public const string Name = "openshift-host";

    /// <summary>Per-request timeout of the client.</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    /// <summary>
    /// Builds the primary handler with the configured trust. The factory rotates handlers periodically; the CA bundle
    /// is parsed once per process (<see cref="OpenShiftHostTrust"/>).
    /// </summary>
    /// <param name="options">The host options.</param>
    /// <param name="trust">The parsed CA bundle, if any.</param>
    /// <returns>A new handler.</returns>
    internal static SocketsHttpHandler CreatePrimaryHandler(OpenShiftHostOptions options, OpenShiftHostTrust trust)
    {
        var sslOptions = new SslClientAuthenticationOptions();
        if (options.SkipTlsVerify)
        {
            // Development only (validated at startup). Accepting any certificate is the whole point of the flag.
#pragma warning disable CA5359 // Do not disable certificate validation
            sslOptions.RemoteCertificateValidationCallback = (_, _, _, _) => true;
#pragma warning restore CA5359
        }
        else if (trust.Certificates is { } certificates)
        {
            var policy = new X509ChainPolicy
            {
                TrustMode = X509ChainTrustMode.CustomRootTrust,
                RevocationMode = X509RevocationMode.NoCheck,
            };
            policy.CustomTrustStore.AddRange(certificates);
            sslOptions.CertificateChainPolicy = policy;
        }

        return new SocketsHttpHandler
        {
            SslOptions = sslOptions,
            ConnectTimeout = Timeout,
            AllowAutoRedirect = false,
            UseCookies = false,
        };
    }
}

/// <summary>
/// The parsed <see cref="OpenShiftHostOptions.CaBundlePath"/> certificates, loaded once (singleton) and disposed with
/// the container.
/// </summary>
internal sealed class OpenShiftHostTrust : IDisposable
{
    /// <summary>Loads the bundle named by the options, if any.</summary>
    /// <param name="options">The host options.</param>
    /// <exception cref="InvalidOperationException">The file holds no readable PEM certificate.</exception>
    public OpenShiftHostTrust(IOptions<OpenShiftHostOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var path = options.Value.CaBundlePath;
        if (options.Value.SkipTlsVerify || string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        var certificates = new X509Certificate2Collection();
        try
        {
            certificates.ImportFromPemFile(path);
        }
        catch (CryptographicException exception)
        {
            throw new InvalidOperationException($"{OpenShiftHostOptions.SectionName}:CaBundlePath contains no readable PEM certificate.", exception);
        }

        if (certificates.Count == 0)
        {
            throw new InvalidOperationException($"{OpenShiftHostOptions.SectionName}:CaBundlePath contains no PEM certificate.");
        }

        Certificates = certificates;
    }

    /// <summary>The trusted CA certificates, or <see langword="null"/> for system trust / skip.</summary>
    public X509Certificate2Collection? Certificates { get; }

    /// <inheritdoc />
    public void Dispose()
    {
        if (Certificates is null)
        {
            return;
        }

        foreach (var certificate in Certificates)
        {
            certificate.Dispose();
        }
    }
}
