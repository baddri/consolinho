using System.Text.Json;
using FleetConsole.Api.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace FleetConsole.Api.Tests.Http;

/// <summary>
/// Executes HTTP results / exception handling against a <see cref="DefaultHttpContext"/> backed by the Api's real
/// ProblemDetails registration, and exposes the written status and JSON body.
/// </summary>
internal static class HttpResultExecutor
{
    public static ServiceProvider BuildServices(string environmentName = "Production")
    {
        var services = new ServiceCollection();
        services.AddSingleton<ILoggerFactory>(NullLoggerFactory.Instance);
        services.AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment(environmentName));
        services.AddApiProblemDetails();
        return services.BuildServiceProvider();
    }

    public static DefaultHttpContext CreateContext(IServiceProvider services, string path = "/api/things/42")
    {
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Method = HttpMethods.Get;
        context.Request.Path = path;
        context.Response.Body = new MemoryStream();
        return context;
    }

    public static async Task<(int Status, string? ContentType, JsonElement? Body)> ExecuteAsync(IResult result, string environmentName = "Production")
    {
        await using var services = BuildServices(environmentName);
        var context = CreateContext(services);
        await result.ExecuteAsync(context);
        return await ReadAsync(context);
    }

    public static async Task<(int Status, string? ContentType, JsonElement? Body)> ReadAsync(HttpContext context)
    {
        context.Response.Body.Position = 0;
        if (context.Response.Body.Length == 0)
        {
            return (context.Response.StatusCode, context.Response.ContentType, null);
        }

        using var document = await JsonDocument.ParseAsync(context.Response.Body);
        return (context.Response.StatusCode, context.Response.ContentType, document.RootElement.Clone());
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "FleetConsole.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
