using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Hosting;

/// <summary>
/// The browser-visible origin of FleetConsole (<c>Console:PublicOrigin</c>, contract §12, ADR-0010), e.g.
/// <c>https://fleetconsole.apps.host.example.com</c>. The single source for the OAuth <c>redirect_uri</c> and, from CP2,
/// the WebSocket <c>Origin</c> check.
/// </summary>
/// <remarks>
/// <para><b>Why configuration and not the request:</b> behind the Vite dev proxy (<c>changeOrigin</c>) or an OpenShift
/// route the Api can't see the origin the browser used, and deriving security-relevant URLs from request headers
/// (<c>Host</c>, <c>X-Forwarded-*</c>) would let a client influence them (SECURITY.md).</para>
/// <para>Required outside Development (startup error). In Development it defaults to
/// <see cref="DevelopmentDefault"/>, the Api's own launch-profile URL; the AppHost overrides it with the Vite URL.</para>
/// </remarks>
public sealed class PublicOriginOptions
{
    /// <summary>Configuration section of the console's hosting settings.</summary>
    public const string SectionName = "Console";

    /// <summary>The origin used in Development when none is configured (the Api's http launch profile).</summary>
    public const string DevelopmentDefault = "http://localhost:5180";

    /// <summary>
    /// The configured origin: an absolute http(s) URL with scheme, host and optional port, without path (a single
    /// trailing <c>/</c> is tolerated), query, fragment or user info. Validated at startup.
    /// </summary>
    public string? PublicOrigin { get; set; }

    /// <summary>
    /// The normalized origin without trailing slash (<c>scheme://host[:port]</c>, lower-case host, default port
    /// omitted). Only meaningful after validation succeeded.
    /// </summary>
    /// <returns>The origin.</returns>
    /// <exception cref="InvalidOperationException">The value is missing or invalid (validation was bypassed: a bug).</exception>
    public string GetOrigin() =>
        PublicOriginOptionsValidator.TryNormalize(PublicOrigin, out var origin)
            ? origin
            : throw new InvalidOperationException($"{SectionName}:PublicOrigin is not a valid origin.");
}

/// <summary>
/// Startup validation of <see cref="PublicOriginOptions"/>: the value must be an origin, because the OAuth callback URL
/// is built by appending a path to it. Messages name the key, not the value.
/// </summary>
internal sealed class PublicOriginOptionsValidator : IValidateOptions<PublicOriginOptions>
{
    /// <inheritdoc />
    public ValidateOptionsResult Validate(string? name, PublicOriginOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        return TryNormalize(options.PublicOrigin, out _)
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(
                $"{PublicOriginOptions.SectionName}:PublicOrigin is required and must be an absolute http(s) origin without path, query or fragment (e.g. https://fleet.example.org).");
    }

    /// <summary>Checks <paramref name="value"/> and returns its normalized form.</summary>
    /// <param name="value">The configured value.</param>
    /// <param name="origin">The normalized origin when the method returns <see langword="true"/>.</param>
    /// <returns>Whether the value is a valid origin.</returns>
    internal static bool TryNormalize(string? value, out string origin)
    {
        origin = string.Empty;
        if (string.IsNullOrWhiteSpace(value)
            || !Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || uri.AbsolutePath != "/"
            || uri.UserInfo.Length > 0
            // Checked on the raw text: Uri may drop an empty "?" or "#".
            || value.IndexOfAny(['?', '#']) >= 0)
        {
            return false;
        }

        origin = uri.GetLeftPart(UriPartial.Authority);
        return true;
    }
}

/// <summary>Registers <see cref="PublicOriginOptions"/>.</summary>
public static class PublicOriginSetup
{
    /// <summary>
    /// Binds and validates <see cref="PublicOriginOptions"/> on start; fills <see cref="PublicOriginOptions.DevelopmentDefault"/>
    /// in Development when nothing is configured.
    /// </summary>
    /// <param name="builder">The Api's application builder.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static WebApplicationBuilder AddPublicOrigin(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.AddOptions<PublicOriginOptions>()
            .BindConfiguration(PublicOriginOptions.SectionName)
            .ValidateOnStart();
        builder.Services.AddSingleton<IValidateOptions<PublicOriginOptions>, PublicOriginOptionsValidator>();

        if (builder.Environment.IsDevelopment())
        {
            builder.Services.PostConfigure<PublicOriginOptions>(options =>
            {
                if (string.IsNullOrWhiteSpace(options.PublicOrigin))
                {
                    options.PublicOrigin = PublicOriginOptions.DevelopmentDefault;
                }
            });
        }

        return builder;
    }
}
