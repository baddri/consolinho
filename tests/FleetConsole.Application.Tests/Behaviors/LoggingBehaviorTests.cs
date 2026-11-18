using FleetConsole.Application.Behaviors;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Application.Tests.Behaviors;

public sealed class LoggingBehaviorTests
{
    private static readonly CancellationToken Ct = TestContext.Current.CancellationToken;

    private readonly RecordingLogger<LoggingBehavior<CreateThingCommand, Result<Guid>>> _logger = new();

    [Fact]
    public async Task Success_ReturnsHandlerResponse_AndLogsAtDebug()
    {
        var behavior = new LoggingBehavior<CreateThingCommand, Result<Guid>>(_logger);
        var id = Guid.NewGuid();

        var result = await behavior.Handle(new CreateThingCommand("ok"), _ => Task.FromResult<Result<Guid>>(id), Ct);

        result.Value.ShouldBe(id);
        _logger.Entries.Select(e => e.Level).ShouldBe([LogLevel.Debug]);
    }

    [Theory]
    [InlineData(ErrorType.NotFound, LogLevel.Information)]
    [InlineData(ErrorType.Validation, LogLevel.Information)]
    [InlineData(ErrorType.Failure, LogLevel.Warning)]
    public async Task Failure_IsReturnedUnchanged_AndLoggedByCategory(ErrorType type, LogLevel expectedLevel)
    {
        var behavior = new LoggingBehavior<CreateThingCommand, Result<Guid>>(_logger);
        var error = new Error("Things.Problem", "Problem.", type);

        var result = await behavior.Handle(new CreateThingCommand("ok"), _ => Task.FromResult<Result<Guid>>(error), Ct);

        result.Error.ShouldBe(error);
        var entry = _logger.Entries.ShouldHaveSingleItem();
        entry.Level.ShouldBe(expectedLevel);
        entry.Message.ShouldContain("Things.Problem");
    }

    [Fact]
    public async Task Exception_IsRethrown_WithoutLogging()
    {
        var behavior = new LoggingBehavior<CreateThingCommand, Result<Guid>>(_logger);

        await Should.ThrowAsync<TimeoutException>(() =>
            behavior.Handle(new CreateThingCommand("ok"), _ => throw new TimeoutException(), Ct));

        _logger.Entries.ShouldBeEmpty();
    }

    [Fact]
    public async Task LogMessage_ContainsRequestTypeName_ButNotRequestContents()
    {
        var behavior = new LoggingBehavior<CreateThingCommand, Result<Guid>>(_logger);

        await behavior.Handle(new CreateThingCommand("s3cr3t"), _ => Task.FromResult<Result<Guid>>(Guid.NewGuid()), Ct);

        var message = _logger.Entries.ShouldHaveSingleItem().Message;
        message.ShouldContain(nameof(CreateThingCommand));
        message.ShouldNotContain("s3cr3t");
    }

    /// <summary>Minimal in-memory logger capturing level and formatted message.</summary>
    private sealed class RecordingLogger<T> : ILogger<T>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }
}
