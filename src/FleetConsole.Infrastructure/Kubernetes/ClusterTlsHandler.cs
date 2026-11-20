using System.Security.Cryptography.X509Certificates;

namespace FleetConsole.Infrastructure.Kubernetes;

/// <summary>
/// An HTTP handler configured for one cluster's TLS settings, together with the <see cref="TlsValidationRecord"/> its
/// certificate callback writes to. Created by <see cref="ClusterTlsHandlerFactory"/>; disposing it disposes the handler
/// and the CA certificates it trusts.
/// </summary>
/// <param name="handler">The configured handler. Wrap it in an <see cref="HttpClient"/> (probe) or
/// <see cref="HttpMessageInvoker"/> (CP2 proxy) with <c>disposeHandler: false</c>; this object owns it.</param>
/// <param name="tls">Where the callback records rejected certificates, for failure classification.</param>
/// <param name="trustedCertificates">The parsed CA bundle, owned and disposed by this object.</param>
internal sealed class ClusterTlsHandler(
    SocketsHttpHandler handler, TlsValidationRecord tls, X509Certificate2Collection? trustedCertificates) : IDisposable
{
    /// <summary>The configured handler.</summary>
    public SocketsHttpHandler Handler { get; } = handler;

    /// <summary>The handler's certificate validation record.</summary>
    public TlsValidationRecord Tls { get; } = tls;

    /// <summary>Disposes the handler (closing pooled connections) and the trusted CA certificates.</summary>
    public void Dispose()
    {
        Handler.Dispose();
        if (trustedCertificates is not null)
        {
            foreach (var certificate in trustedCertificates)
            {
                certificate.Dispose();
            }
        }
    }
}
