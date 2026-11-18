namespace FleetConsole.Application.SystemInfo.GetSystemInfo;

// Returned by GetSystemInfoQuery. Published in the OpenAPI document as the "SystemInfo" schema (OpenApiSetup drops the
// Dto suffix). The XML docs below are copied into that document, so they are written for API consumers.

/// <summary>Build and environment information about this FleetConsole deployment.</summary>
/// <param name="Version">The deployed build version, e.g. <c>1.0.0+3f2c1ab</c> (the suffix is the git commit).</param>
/// <param name="Environment">The hosting environment name, e.g. <c>Development</c> or <c>Production</c>.</param>
public sealed record SystemInfoDto(string Version, string Environment);
