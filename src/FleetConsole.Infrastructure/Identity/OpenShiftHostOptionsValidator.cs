using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// Startup validation of <see cref="OpenShiftHostOptions"/>: a misconfigured login should stop the Api with a clear
/// message instead of failing at the first login. Messages name keys, never values (the secret especially).
/// </summary>
/// <remarks>
/// Outside Development every URL must be <c>https</c>: the client secret (an SA token), authorization codes and the
/// users' access tokens travel over this connection (same rule as T-0010 for managed clusters). Plain <c>http</c> is
/// allowed in Development only, for the DevOAuth emulator. The CA bundle is parsed here so a garbage file is a startup
/// error naming the key, not a failure at the first login or in the warm-up.
/// </remarks>
/// <param name="environment">Decides whether <see cref="OpenShiftHostOptions.SkipTlsVerify"/> is allowed.</param>
internal sealed class OpenShiftHostOptionsValidator(IHostEnvironment environment) : IValidateOptions<OpenShiftHostOptions>
{
    /// <inheritdoc />
    public ValidateOptionsResult Validate(string? name, OpenShiftHostOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var failures = new List<string>();
        const string Prefix = OpenShiftHostOptions.SectionName;
        var allowHttp = environment.IsDevelopment();
        var schemeRule = allowHttp ? "an absolute http(s) URL" : "an absolute https URL (http is allowed in Development only)";

        if (!IsAllowedUrl(options.HostApiServerUrl, allowHttp))
        {
            failures.Add($"{Prefix}:HostApiServerUrl is required and must be {schemeRule}.");
        }

        if (string.IsNullOrWhiteSpace(options.ClientId))
        {
            failures.Add($"{Prefix}:ClientId is required.");
        }

        if (string.IsNullOrWhiteSpace(options.ClientSecret))
        {
            failures.Add($"{Prefix}:ClientSecret is required.");
        }

        if ((options.AuthorizationEndpoint is null) != (options.TokenEndpoint is null))
        {
            failures.Add($"{Prefix}:AuthorizationEndpoint and {Prefix}:TokenEndpoint must be set together (or neither, to use discovery).");
        }
        else if (options.HasStaticEndpoints
                 && (!IsAllowedUrl(options.AuthorizationEndpoint, allowHttp) || !IsAllowedUrl(options.TokenEndpoint, allowHttp)))
        {
            failures.Add($"{Prefix}:AuthorizationEndpoint and {Prefix}:TokenEndpoint must be {schemeRule}.");
        }

        if (!string.IsNullOrWhiteSpace(options.CaBundlePath))
        {
            if (!File.Exists(options.CaBundlePath))
            {
                failures.Add($"{Prefix}:CaBundlePath points to a file that does not exist.");
            }
            else if (!ContainsPemCertificate(options.CaBundlePath))
            {
                failures.Add($"{Prefix}:CaBundlePath contains no readable PEM certificate.");
            }
        }

        if (options.SkipTlsVerify && !environment.IsDevelopment())
        {
            failures.Add($"{Prefix}:SkipTlsVerify is only allowed in Development.");
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static bool IsAllowedUrl(Uri? uri, bool allowHttp) =>
        uri is { IsAbsoluteUri: true } && (uri.Scheme == Uri.UriSchemeHttps || (allowHttp && uri.Scheme == Uri.UriSchemeHttp));

    /// <summary>Whether the file parses as PEM with at least one certificate (same parser as <see cref="OpenShiftHostTrust"/>).</summary>
    private static bool ContainsPemCertificate(string path)
    {
        var certificates = new X509Certificate2Collection();
        try
        {
            certificates.ImportFromPemFile(path);
            return certificates.Count > 0;
        }
        catch (Exception exception) when (exception is CryptographicException or IOException or UnauthorizedAccessException)
        {
            return false;
        }
        finally
        {
            foreach (var certificate in certificates)
            {
                certificate.Dispose();
            }
        }
    }
}
