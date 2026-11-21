namespace FleetConsole.Api.Hosting;

/// <summary>
/// Production logging (ADR-0028 §4, §5): JSON console logs on stdout for the cluster's log collector, and a guarantee
/// enforced in code that request URLs never reach the logs. Called from <c>Program</c> outside Development only.
/// </summary>
/// <remarks>
/// <para><b>Why:</b> ASP.NET Core's request-line log (<see cref="HostingDiagnosticsCategory"/>, "Request starting
/// … GET https://…/api/auth/callback?code=…&amp;state=…") quotes the full URL including the OAuth authorization code.
/// A log-level setting alone is not enough, because anyone tuning <c>Logging:*</c> could switch it back on.</para>
/// <para><b>Traces:</b> the OpenTelemetry ASP.NET Core instrumentation (1.17, ≥ 1.9) redacts <c>url.query</c> values by
/// default; we keep that default and never set
/// <c>OTEL_DOTNET_EXPERIMENTAL_ASPNETCORE_DISABLE_URL_QUERY_REDACTION</c>.</para>
/// </remarks>
public static class LoggingSetup
{
    /// <summary>The logger category of ASP.NET Core's request-start/finish lines, which contain the full URL.</summary>
    public const string HostingDiagnosticsCategory = "Microsoft.AspNetCore.Hosting.Diagnostics";

    /// <summary>
    /// Switches the console logger to the JSON formatter (UTC timestamps, no scopes) and caps
    /// <see cref="HostingDiagnosticsCategory"/> at <see cref="LogLevel.Warning"/> for every logger provider.
    /// </summary>
    /// <remarks>
    /// The cap is added in <c>PostConfigure</c>, i.e. after configuration (<c>Logging:…</c>) and <c>AddFilter</c>
    /// calls have produced their rules. Rule selection first prefers rules for the specific provider over provider-less
    /// ones, then the longest category prefix, then the last rule added. A provider-less cap alone would therefore lose
    /// to e.g. <c>Logging:Console:LogLevel:Microsoft.AspNetCore.Hosting.Diagnostics=Trace</c>; so the cap is added for
    /// the provider-less rule <b>and</b> for every provider name that appears in any existing rule, and, being added
    /// last with the most specific category, it always wins. Providers no rule mentions fall back to the provider-less
    /// cap.
    /// </remarks>
    /// <param name="builder">The Api's application builder.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static WebApplicationBuilder AddProductionLogging(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Logging.AddJsonConsole(options =>
        {
            options.UseUtcTimestamp = true;
            options.IncludeScopes = false;
        });

        builder.Services.PostConfigure<LoggerFilterOptions>(options =>
        {
            var providerNames = options.Rules
                .Select(rule => rule.ProviderName)
                .OfType<string>()
                .Distinct(StringComparer.Ordinal)
                .ToList();

            options.Rules.Add(new LoggerFilterRule(null, HostingDiagnosticsCategory, LogLevel.Warning, null));
            foreach (var providerName in providerNames)
            {
                options.Rules.Add(new LoggerFilterRule(providerName, HostingDiagnosticsCategory, LogLevel.Warning, null));
            }
        });

        return builder;
    }
}
