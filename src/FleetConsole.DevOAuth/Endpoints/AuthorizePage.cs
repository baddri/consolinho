using System.Text;
using System.Text.Encodings.Web;
using FleetConsole.DevOAuth.Configuration;
using FleetConsole.DevOAuth.OAuth;

namespace FleetConsole.DevOAuth.Endpoints;

/// <summary>
/// Server-rendered HTML for <c>/oauth/authorize</c>: the user picker (stands in for OpenShift's login and grant
/// pages) and the error page. Plain string templates, every dynamic value HTML-encoded, no JavaScript.
/// </summary>
internal static class AuthorizePage
{
    private const string Title = "Consolinho DevOAuth — pick a user";

    private static readonly HtmlEncoder Html = HtmlEncoder.Default;

    /// <summary>
    /// Renders one <c>&lt;form method="post"&gt;</c> per user, each carrying the original authorize parameters as hidden
    /// inputs plus <c>username</c>, and a Cancel form that posts <c>cancel=1</c>.
    /// </summary>
    /// <param name="request">The validated authorize request to carry through the forms.</param>
    /// <param name="users">The configured users, in configuration order.</param>
    /// <returns>200 HTML.</returns>
    public static IResult Picker(AuthorizationRequest request, IReadOnlyList<DevOAuthUser> users)
    {
        var hiddenFields = new StringBuilder();
        foreach (var (name, value) in request.ToParameters())
        {
            hiddenFields.Append("      <input type=\"hidden\" name=\"").Append(Html.Encode(name))
                .Append("\" value=\"").Append(Html.Encode(value)).Append("\">\n");
        }

        var body = new StringBuilder();
        body.Append("  <p>Development login emulating the OpenShift OAuth server. Client <code>")
            .Append(Html.Encode(request.Client.ClientId)).Append("</code> requests scope <code>")
            .Append(Html.Encode(request.Scope)).Append("</code>.</p>\n");

        foreach (var user in users)
        {
            var groups = user.Groups.Count == 0 ? "no groups" : string.Join(", ", user.Groups);
            body.Append("  <form method=\"post\" action=\"/oauth/authorize\">\n")
                .Append(hiddenFields)
                .Append("      <button type=\"submit\" name=\"username\" value=\"").Append(Html.Encode(user.Name)).Append("\">")
                .Append("<strong>").Append(Html.Encode(user.Name)).Append("</strong>")
                .Append(user.FullName is null ? string.Empty : $" <span>{Html.Encode(user.FullName)}</span>")
                .Append(" <small>").Append(Html.Encode(groups)).Append("</small></button>\n")
                .Append("  </form>\n");
        }

        body.Append("  <form method=\"post\" action=\"/oauth/authorize\">\n")
            .Append(hiddenFields)
            .Append("      <button type=\"submit\" name=\"cancel\" value=\"1\" class=\"cancel\">Cancel</button>\n")
            .Append("  </form>\n");

        return Page(StatusCodes.Status200OK, body.ToString());
    }

    /// <summary>The 400 page for a request the emulator cannot redirect back from (contract §11).</summary>
    /// <param name="reason">What is wrong; HTML-encoded before rendering.</param>
    /// <returns>400 HTML.</returns>
    public static IResult Error(string reason) =>
        Page(StatusCodes.Status400BadRequest, $"  <p class=\"error\">Invalid authorization request: {Html.Encode(reason)}</p>\n");

    private static HtmlResult Page(int statusCode, string body) =>
        new HtmlResult(statusCode, $$"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <title>{{Title}}</title>
              <style>
                body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; }
                form { margin: 0.5rem 0; }
                button { width: 100%; padding: 0.75rem; text-align: left; cursor: pointer; }
                button.cancel { text-align: center; }
                small { color: #555; margin-left: 0.5rem; }
                .error { color: #a30000; }
              </style>
            </head>
            <body>
              <h1>{{Title}}</h1>
            {{body}}</body>
            </html>
            """);

    /// <summary>
    /// HTML response with headers suited to a login page: never cached, not frameable, no scripts, and no referrer
    /// (the page URL carries <c>state</c> and the PKCE challenge).
    /// </summary>
    private sealed class HtmlResult(int statusCode, string html) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            var response = httpContext.Response;
            response.StatusCode = statusCode;
            response.ContentType = "text/html; charset=utf-8";
            response.Headers.CacheControl = "no-store";
            response.Headers.ContentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";
            response.Headers.XContentTypeOptions = "nosniff";
            response.Headers["Referrer-Policy"] = "no-referrer";
            return response.WriteAsync(html, httpContext.RequestAborted);
        }
    }
}
