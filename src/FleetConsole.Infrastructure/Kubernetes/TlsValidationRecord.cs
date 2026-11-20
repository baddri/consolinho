using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using FleetConsole.Application.Abstractions.Kubernetes;

namespace FleetConsole.Infrastructure.Kubernetes;

/// <summary>
/// What the certificate validation callback of one <see cref="ClusterTlsHandler"/> saw when it rejected a server
/// certificate. A failed handshake surfaces as a generic <c>AuthenticationException</c>; this record is how we still
/// tell an admin <em>why</em> (unknown CA, expired, wrong host) instead of "TLS failed" (ADR-0011).
/// </summary>
/// <remarks>
/// One record per handler, written by the callback and read after the failed request. Connections of the same handler
/// may handshake concurrently, so access is locked; they all talk to the same server, so "last rejection wins" is exact
/// enough. Successful validations are not recorded and never clear an earlier rejection — fine for a short-lived probe
/// session; a long-lived pooled handler (CP2) must use a fresh record per connection attempt or clear it on success.
/// </remarks>
internal sealed class TlsValidationRecord
{
    private readonly Lock _lock = new();
    private SslPolicyErrors _policyErrors;
    private X509ChainStatusFlags _chainStatus;
    private bool _hasRejection;

    /// <summary>Records a rejected certificate's policy errors and chain status (skip-TLS handlers record nothing).</summary>
    /// <param name="policyErrors">The errors SslStream reported to the callback.</param>
    /// <param name="chain">The chain SslStream built, if any; its status flags are OR-ed together.</param>
    public void Record(SslPolicyErrors policyErrors, X509Chain? chain)
    {
        var chainStatus = X509ChainStatusFlags.NoError;
        if (chain is not null)
        {
            foreach (var status in chain.ChainStatus)
            {
                chainStatus |= status.Status;
            }
        }

        lock (_lock)
        {
            _policyErrors = policyErrors;
            _chainStatus = chainStatus;
            _hasRejection = true;
        }
    }

    /// <summary>
    /// Maps the recorded rejection to a TLS failure kind, or <see langword="null"/> when the callback never rejected a
    /// certificate (the handshake failed for another reason, e.g. protocol mismatch).
    /// </summary>
    /// <remarks>
    /// Priority when several problems coexist: unknown authority first (nothing else can be trusted until the CA is
    /// right), then validity period, then host name. A name mismatch is reported only when the chain itself is fine.
    /// </remarks>
    /// <returns>The most actionable TLS failure kind, or <see langword="null"/>.</returns>
    public ProbeFailureKind? Classify()
    {
        SslPolicyErrors policyErrors;
        X509ChainStatusFlags chainStatus;
        lock (_lock)
        {
            if (!_hasRejection)
            {
                return null;
            }

            policyErrors = _policyErrors;
            chainStatus = _chainStatus;
        }

        if (policyErrors.HasFlag(SslPolicyErrors.RemoteCertificateNotAvailable))
        {
            return ProbeFailureKind.TlsOther;
        }

        if ((chainStatus & (X509ChainStatusFlags.UntrustedRoot | X509ChainStatusFlags.PartialChain)) != 0)
        {
            return ProbeFailureKind.TlsUnknownAuthority;
        }

        if ((chainStatus & X509ChainStatusFlags.NotTimeValid) != 0)
        {
            return ProbeFailureKind.TlsCertificateExpired;
        }

        if (policyErrors.HasFlag(SslPolicyErrors.RemoteCertificateNameMismatch))
        {
            return ProbeFailureKind.TlsHostnameMismatch;
        }

        return ProbeFailureKind.TlsOther;
    }
}
