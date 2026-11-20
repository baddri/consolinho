using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// What the Api's <c>"openshift-host"</c> client talks to in integration tests: the in-process DevOAuth emulator,
/// observed and optionally broken. One instance per <see cref="ApiFactory"/>; the factory builds a fresh
/// <see cref="Handler"/> pipeline around it whenever <c>IHttpClientFactory</c> asks.
/// </summary>
/// <remarks>
/// Records every access token the emulator issues, so AUTH-3 tests can search for it in cookies, the database and logs.
/// The switches simulate AUTH-14 outages and broken answers: the whole host down (connection refused), only
/// <c>users/~</c> failing, or the token endpoint unreachable or answering a canned status/body (the emulator then never
/// sees the token request).
/// </remarks>
public sealed class OpenShiftHostStub
{
    private readonly ConcurrentQueue<string> _issuedAccessTokens = new();

    /// <summary>When true, every request fails like a refused connection (host API and OAuth server unreachable).</summary>
    public bool Down { get; set; }

    /// <summary>When set, <c>users/~</c> answers with this status instead of reaching the emulator.</summary>
    public HttpStatusCode? UsersEndpointStatus { get; set; }

    /// <summary>When true, only the token endpoint fails like a refused connection (discovery and authorize still work).</summary>
    public bool TokenEndpointDown { get; set; }

    /// <summary>When set, the token endpoint answers with this status and <see cref="TokenEndpointBody"/>.</summary>
    public HttpStatusCode? TokenEndpointStatus { get; set; }

    /// <summary>The body for <see cref="TokenEndpointStatus"/> (sent as <c>application/json</c>, whatever it contains).</summary>
    public string TokenEndpointBody { get; set; } = string.Empty;

    /// <summary>Clears every switch.</summary>
    public void Reset()
    {
        Down = false;
        UsersEndpointStatus = null;
        TokenEndpointDown = false;
        TokenEndpointStatus = null;
        TokenEndpointBody = string.Empty;
    }

    /// <summary>Access tokens returned by the emulator's token endpoint, in order.</summary>
    public IReadOnlyList<string> IssuedAccessTokens => [.. _issuedAccessTokens];

    /// <summary>Creates a handler that applies the switches and forwards to <paramref name="emulator"/>.</summary>
    /// <param name="emulator">The emulator's in-memory handler (<c>TestServer.CreateHandler()</c>).</param>
    /// <returns>A new handler; <c>IHttpClientFactory</c> owns and disposes it.</returns>
    public HttpMessageHandler Handler(HttpMessageHandler emulator) => new StubHandler(this, emulator);

    private sealed class StubHandler(OpenShiftHostStub stub, HttpMessageHandler emulator) : DelegatingHandler(emulator)
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (stub.Down)
            {
                throw new HttpRequestException("Connection refused (test: host down)");
            }

            var path = request.RequestUri?.AbsolutePath ?? string.Empty;
            if (stub.UsersEndpointStatus is { } status && path.EndsWith("/users/~", StringComparison.Ordinal))
            {
                return new HttpResponseMessage(status) { RequestMessage = request };
            }

            var isToken = path.EndsWith("/oauth/token", StringComparison.Ordinal);
            if (isToken && stub.TokenEndpointDown)
            {
                throw new HttpRequestException("Connection refused (test: token endpoint down)");
            }

            if (isToken && stub.TokenEndpointStatus is { } tokenStatus)
            {
                return new HttpResponseMessage(tokenStatus)
                {
                    RequestMessage = request,
                    Content = new StringContent(stub.TokenEndpointBody, System.Text.Encoding.UTF8, "application/json"),
                };
            }

            var response = await base.SendAsync(request, cancellationToken);
            if (isToken && response.IsSuccessStatusCode)
            {
                // Read and put back an equivalent body: the caller still parses it.
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                using (var json = JsonDocument.Parse(body))
                {
                    stub._issuedAccessTokens.Enqueue(json.RootElement.GetProperty("access_token").GetString()!);
                }

                var headers = response.Content.Headers.ToList();
                response.Content = new StringContent(body);
                response.Content.Headers.Clear();
                foreach (var header in headers)
                {
                    response.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
            }

            return response;
        }
    }
}
