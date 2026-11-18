using System.Text.Json;
using System.Text.Json.Serialization;

namespace FleetConsole.Infrastructure.Kubernetes;

/// <summary>JSON settings for Kubernetes API bodies: camelCase, case-insensitive reads, null fields omitted on write.</summary>
internal static class KubernetesJson
{
    /// <summary>Shared options (cached: building options per call defeats System.Text.Json's metadata cache).</summary>
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
