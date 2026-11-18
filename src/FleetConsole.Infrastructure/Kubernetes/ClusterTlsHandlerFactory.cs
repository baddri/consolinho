using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using FleetConsole.Application.Abstractions.Kubernetes;

namespace FleetConsole.Infrastructure.Kubernetes;

/// <summary>
/// Builds the <see cref="SocketsHttpHandler"/> that talks to one managed cluster with that cluster's TLS trust
/// settings (ADR-0011). Used per test run by <see cref="ClusterProbeClient"/>; CP2's <c>ClusterHttpClientPool</c> reuses
/// it for its long-lived per-cluster forwarding handlers, so trust and failure capture behave identically in both.
/// </summary>
/// <remarks>
/// <para>Trust modes, from <see cref="ClusterConnection"/>:</para>
/// <list type="bullet">
/// <item><see cref="ClusterConnection.SkipTlsVerify"/> → any certificate is accepted and nothing is recorded, so any
/// TLS failure in this mode classifies as <see cref="ProbeFailureKind.TlsOther"/>.</item>
/// <item>A CA bundle → <see cref="X509ChainTrustMode.CustomRootTrust"/> with <em>only</em> the bundle's certificates
/// as the trust store (like <c>certificate-authority-data</c> in a kubeconfig; the system store is not consulted).
/// Tested with a root CA bundle; whether .NET accepts a bundle holding only an intermediate as an anchor is unverified. Revocation is
/// not checked: cluster-internal CAs publish no CRL/OCSP endpoints, and an online check would only add latency and
/// spurious failures.</item>
/// <item>Neither → the system trust store (public CAs, e.g. a cluster behind a Let's Encrypt certificate).</item>
/// </list>
/// <para>The validation callback records <see cref="SslPolicyErrors"/> and chain status into the handler's
/// <see cref="TlsValidationRecord"/>, so a failed handshake can be classified exactly.</para>
/// <para>Redirects are never followed (an API server has no reason to redirect, and following one could carry the
/// request elsewhere) and cookies are not kept.</para>
/// </remarks>
internal sealed class ClusterTlsHandlerFactory
{
    /// <summary>
    /// How long establishing a TCP connection may take (the handler's default is infinite). Callers usually have a
    /// shorter overall timeout too; this bound matters for long-lived handlers such as CP2's pool.
    /// </summary>
    public TimeSpan ConnectTimeout { get; init; } = TimeSpan.FromSeconds(10);

    /// <summary>Creates a handler for <paramref name="connection"/>.</summary>
    /// <param name="connection">The cluster's TLS settings.</param>
    /// <returns>The handler and its validation record; the caller disposes it.</returns>
    /// <exception cref="InvalidCaBundleException">The CA bundle is not PEM or contains no certificate.</exception>
    public ClusterTlsHandler Create(ClusterConnection connection)
    {
        ArgumentNullException.ThrowIfNull(connection);

        var record = new TlsValidationRecord();
        var skipTlsVerify = connection.SkipTlsVerify;
        var trustedCertificates = skipTlsVerify || string.IsNullOrWhiteSpace(connection.CaBundlePem)
            ? null
            : ParseCaBundle(connection.CaBundlePem);

        var sslOptions = new SslClientAuthenticationOptions
        {
            RemoteCertificateValidationCallback = (_, _, chain, policyErrors) =>
            {
                if (policyErrors == SslPolicyErrors.None)
                {
                    return true;
                }

                if (skipTlsVerify)
                {
                    // Tolerated, so not recorded: a later handshake failure for another reason (protocol mismatch)
                    // must classify as TlsOther, not as this certificate problem the admin chose to ignore.
                    return true;
                }

                record.Record(policyErrors, chain);
                return false;
            },
        };

        if (trustedCertificates is not null)
        {
            var policy = new X509ChainPolicy
            {
                TrustMode = X509ChainTrustMode.CustomRootTrust,
                RevocationMode = X509RevocationMode.NoCheck,
            };
            policy.CustomTrustStore.AddRange(trustedCertificates);
            sslOptions.CertificateChainPolicy = policy;
        }

        var handler = new SocketsHttpHandler
        {
            SslOptions = sslOptions,
            ConnectTimeout = ConnectTimeout,
            AllowAutoRedirect = false,
            UseCookies = false,
        };

        return new ClusterTlsHandler(handler, record, trustedCertificates);
    }

    private static X509Certificate2Collection ParseCaBundle(string pem)
    {
        var certificates = new X509Certificate2Collection();
        try
        {
            certificates.ImportFromPem(pem);
        }
        catch (CryptographicException exception)
        {
            DisposeAll(certificates);
            throw new InvalidCaBundleException(exception);
        }

        if (certificates.Count == 0)
        {
            throw new InvalidCaBundleException(innerException: null);
        }

        return certificates;
    }

    private static void DisposeAll(X509Certificate2Collection certificates)
    {
        foreach (var certificate in certificates)
        {
            certificate.Dispose();
        }
    }
}

/// <summary>
/// The configured CA bundle is not usable PEM (thrown by <see cref="ClusterTlsHandlerFactory.Create"/>). Registration
/// validates bundles, so this means stored data went bad; the probe reports it as <see cref="ProbeFailureKind.TlsOther"/>.
/// </summary>
internal sealed class InvalidCaBundleException : Exception
{
    /// <summary>Creates the exception; the message never contains the bundle content.</summary>
    /// <param name="innerException">The PEM parser's error, if any.</param>
    public InvalidCaBundleException(Exception? innerException)
        : base("The cluster's CA bundle contains no readable PEM certificate.", innerException)
    {
    }
}
