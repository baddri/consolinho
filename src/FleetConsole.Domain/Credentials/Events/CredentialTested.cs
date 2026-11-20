using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Credentials.Events;

/// <summary>
/// A connection test ran against a stored credential and its summary was recorded (TEST-5). Audited as
/// <c>credential.tested</c>. Every test is recorded, also when the outcome equals the previous one.
/// </summary>
/// <param name="CredentialId">The credential's id.</param>
/// <param name="ClusterId">The cluster it belongs to.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="Name">The credential's name.</param>
/// <param name="Succeeded">Whether no step failed.</param>
/// <param name="FailedStep">The failed step, if any.</param>
/// <param name="Headline">The capability headline, if the capabilities step ran.</param>
public sealed record CredentialTested(
    CredentialId CredentialId,
    ClusterId ClusterId,
    string ClusterName,
    string Name,
    bool Succeeded,
    ConnectionTestStep? FailedStep,
    CapabilityLevel? Headline) : IDomainEvent;
