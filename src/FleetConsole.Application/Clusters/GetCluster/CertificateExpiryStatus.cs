namespace FleetConsole.Application.Clusters.GetCluster;

// Published in the OpenAPI document; the XML docs are written for API consumers.

/// <summary>Validity of a CA certificate at the time of the request; certificates are flagged 30 days before they expire.</summary>
public enum CertificateExpiryStatus
{
    /// <summary>Valid for more than 30 days.</summary>
    Ok = 0,

    /// <summary>Expires within 30 days.</summary>
    ExpiringSoon = 1,

    /// <summary>Already expired.</summary>
    Expired = 2,
}
