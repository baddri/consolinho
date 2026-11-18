using FleetConsole.Api.Http;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Http;

public sealed class GlobalExceptionHandlerTests
{
    private const string SecretMessage = "connection string Password=hunter2";

    [Fact]
    public async Task UnhandledException_OutsideDevelopment_Returns500ProblemWithoutDetails()
    {
        var (handled, status, body) = await HandleAsync(new InvalidOperationException(SecretMessage), "Production");

        handled.ShouldBeTrue();
        status.ShouldBe(StatusCodes.Status500InternalServerError);
        var json = body.ShouldNotBeNull();
        json.GetProperty("status").GetInt32().ShouldBe(500);
        json.GetProperty("title").GetString().ShouldBe("An unexpected error occurred.");
        json.GetProperty("traceId").GetString().ShouldNotBeNullOrEmpty();
        json.TryGetProperty("detail", out _).ShouldBeFalse();
        json.GetRawText().ShouldNotContain("hunter2");
        json.GetRawText().ShouldNotContain(nameof(InvalidOperationException));
    }

    [Fact]
    public async Task UnhandledException_InDevelopment_IncludesExceptionDetail()
    {
        var (_, status, body) = await HandleAsync(new InvalidOperationException(SecretMessage), "Development");

        status.ShouldBe(StatusCodes.Status500InternalServerError);
        (body.ShouldNotBeNull().GetProperty("detail").GetString() ?? string.Empty).ShouldContain(SecretMessage);
    }

    [Fact]
    public async Task BadHttpRequest_KeepsItsClientErrorStatus()
    {
        var (_, status, body) = await HandleAsync(new BadHttpRequestException("Failed to read parameter", StatusCodes.Status400BadRequest), "Production");

        status.ShouldBe(StatusCodes.Status400BadRequest);
        body.ShouldNotBeNull().GetProperty("status").GetInt32().ShouldBe(400);
    }

    [Fact]
    public async Task CancellationByClient_Returns499WithoutBody()
    {
        await using var services = HttpResultExecutor.BuildServices();
        var context = HttpResultExecutor.CreateContext(services);
        using var aborted = new CancellationTokenSource();
        await aborted.CancelAsync();
        context.RequestAborted = aborted.Token;

        var handled = await Handler(services).TryHandleAsync(context, new OperationCanceledException(aborted.Token), CancellationToken.None);

        handled.ShouldBeTrue();
        var (status, _, body) = await HttpResultExecutor.ReadAsync(context);
        status.ShouldBe(499);
        body.ShouldBeNull();
    }

    [Fact]
    public async Task CancellationNotCausedByClient_IsTreatedAsServerError()
    {
        var (_, status, _) = await HandleAsync(new OperationCanceledException(), "Production");

        status.ShouldBe(StatusCodes.Status500InternalServerError);
    }

    private static async Task<(bool Handled, int Status, System.Text.Json.JsonElement? Body)> HandleAsync(Exception exception, string environment)
    {
        await using var services = HttpResultExecutor.BuildServices(environment);
        var context = HttpResultExecutor.CreateContext(services);

        var handled = await Handler(services).TryHandleAsync(context, exception, CancellationToken.None);

        var (status, _, body) = await HttpResultExecutor.ReadAsync(context);
        return (handled, status, body);
    }

    private static GlobalExceptionHandler Handler(IServiceProvider services) =>
        services.GetServices<IExceptionHandler>().ShouldHaveSingleItem().ShouldBeOfType<GlobalExceptionHandler>();
}
