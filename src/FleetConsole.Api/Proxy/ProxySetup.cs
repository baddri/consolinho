using FleetConsole.Application.Proxy;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Proxy;

/// <summary>
/// Registers what the Kubernetes proxy endpoint (<see cref="KubernetesProxyEndpoint"/>) needs in the Api: YARP's
/// <c>IHttpForwarder</c> for direct forwarding (ADR-0020) and the validated <see cref="ProxyOptions"/> (<c>Proxy:*</c>,
/// CP2 contract §7). The per-cluster invoker pool and the authorization query are registered by Infrastructure and
/// Application.
/// </summary>
public static class ProxySetup
{
    /// <summary>
    /// Adds the HTTP forwarder and binds <see cref="ProxyOptions"/> from <see cref="ProxyOptions.SectionName"/>,
    /// validated on start so a bad timeout or limit stops the host instead of breaking every proxied request.
    /// </summary>
    /// <param name="builder">The Api's application builder.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static WebApplicationBuilder AddKubernetesProxy(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.AddHttpForwarder();
        builder.Services.AddOptions<ProxyOptions>()
            .BindConfiguration(ProxyOptions.SectionName)
            .ValidateOnStart();
        builder.Services.AddSingleton<IValidateOptions<ProxyOptions>, ProxyOptionsValidator>();

        return builder;
    }
}

/// <summary>
/// Validates <see cref="ProxyOptions"/>: positive request timeout, a watch cap of whole seconds of at least one second
/// (it is forwarded as the integer <c>timeoutSeconds</c>), an exec session cap of whole seconds of at least one second
/// (ADR-0036), and a positive mutation body limit.
/// </summary>
internal sealed class ProxyOptionsValidator : IValidateOptions<ProxyOptions>
{
    /// <summary>Checks the bound values.</summary>
    /// <param name="name">The options name (unused; the options are unnamed).</param>
    /// <param name="options">The bound options.</param>
    /// <returns>Success, or a failure listing every invalid key.</returns>
    public ValidateOptionsResult Validate(string? name, ProxyOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        List<string> failures = [];
        if (options.RequestTimeout <= TimeSpan.Zero)
        {
            failures.Add($"{ProxyOptions.SectionName}:{nameof(ProxyOptions.RequestTimeout)} must be greater than zero.");
        }

        if (!IsWholeSecondsCap(options.WatchTimeoutCap))
        {
            failures.Add($"{ProxyOptions.SectionName}:{nameof(ProxyOptions.WatchTimeoutCap)} must be a whole number of seconds, at least 1 s.");
        }

        if (options.StreamIdleSlack < TimeSpan.Zero)
        {
            failures.Add($"{ProxyOptions.SectionName}:{nameof(ProxyOptions.StreamIdleSlack)} must not be negative.");
        }

        if (!IsWholeSecondsCap(options.ExecSessionCap))
        {
            failures.Add($"{ProxyOptions.SectionName}:{nameof(ProxyOptions.ExecSessionCap)} must be a whole number of seconds, at least 1 s.");
        }

        if (options.MaxMutationBodyBytes <= 0)
        {
            failures.Add($"{ProxyOptions.SectionName}:{nameof(ProxyOptions.MaxMutationBodyBytes)} must be greater than zero.");
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    // At least one second, whole seconds, and representable as int seconds (the watch cap is forwarded as one).
    private static bool IsWholeSecondsCap(TimeSpan cap) =>
        cap >= TimeSpan.FromSeconds(1) && cap.Ticks % TimeSpan.TicksPerSecond == 0 && cap.TotalSeconds <= int.MaxValue;
}
