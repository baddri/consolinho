using System.Text.Json.Serialization;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Api.Endpoints.Admin;

// Request bodies of the cluster administration endpoints (contract §8.2). Published in the OpenAPI document; the XML
// docs are written for API consumers. Enable/disable use VersionRequest.
//
// Environment is [JsonRequired]: a missing value would otherwise bind to the enum's first member (production) without
// anyone choosing it. A body without it is a malformed request (400 ProblemDetails, like any other unbindable body).
//
// Distribution (CP3.7) is nullable instead: the spec wants a missing choice reported as a field error ("Choose
// OpenShift or Kubernetes.", DIST-4) next to the control rather than as a generic malformed body. A missing or null value therefore binds and is rejected by the command validator; an unknown string (e.g.
// "rancher") still fails binding (400).

/// <summary>Registers a cluster.</summary>
/// <param name="Name">Unique, immutable name: lowercase letters, digits and '-', 1 to 40 characters, starting and ending with a letter or digit.</param>
/// <param name="DisplayName">Display name, at most 100 characters; blank defaults to the name.</param>
/// <param name="ApiUrl">The API server URL: absolute https URL with host and optional port, no path, query or fragment.</param>
/// <param name="Environment">The cluster's environment (required).</param>
/// <param name="Distribution">OpenShift or Kubernetes (required; missing or null is a validation error on this field). Presentation only: it sets the cluster's tag and theme.</param>
/// <param name="WebConsoleUrl">Optional absolute https link to the cluster's web console, at most 2048 characters.</param>
/// <param name="Description">Optional description, at most 1000 characters.</param>
/// <param name="CaBundle">Optional PEM bundle of CA certificates to trust (at most 256 KiB); blank means system trust.</param>
/// <param name="SkipTlsVerify">Skip TLS certificate verification; not allowed together with a CA bundle.</param>
/// <param name="IsEnabled">Whether granted users see the cluster right away (default true).</param>
public sealed record RegisterClusterRequest(
    string Name,
    string? DisplayName,
    string ApiUrl,
    [property: JsonRequired] ClusterEnvironment Environment,
    ClusterDistribution? Distribution,
    string? WebConsoleUrl,
    string? Description,
    string? CaBundle,
    bool SkipTlsVerify,
    bool IsEnabled = true);

/// <summary>Replaces all editable settings of a cluster; the name can't be changed.</summary>
/// <param name="DisplayName">Display name, at most 100 characters; blank defaults to the name.</param>
/// <param name="ApiUrl">The API server URL: absolute https URL with host and optional port, no path, query or fragment.</param>
/// <param name="Environment">The cluster's environment (required).</param>
/// <param name="Distribution">OpenShift or Kubernetes (required; missing or null is a validation error on this field). Presentation only: it sets the cluster's tag and theme.</param>
/// <param name="WebConsoleUrl">Optional absolute https link to the cluster's web console; blank removes it.</param>
/// <param name="Description">Optional description, at most 1000 characters; blank removes it.</param>
/// <param name="CaBundle">Optional PEM bundle of CA certificates to trust (at most 256 KiB); blank means system trust.</param>
/// <param name="SkipTlsVerify">Skip TLS certificate verification; not allowed together with a CA bundle.</param>
/// <param name="Version">The cluster's version from its last representation.</param>
public sealed record UpdateClusterRequest(
    string? DisplayName,
    string ApiUrl,
    [property: JsonRequired] ClusterEnvironment Environment,
    ClusterDistribution? Distribution,
    string? WebConsoleUrl,
    string? Description,
    string? CaBundle,
    bool SkipTlsVerify,
    uint Version);
