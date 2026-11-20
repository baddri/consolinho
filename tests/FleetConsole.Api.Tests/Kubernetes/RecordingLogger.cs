using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Api.Tests.Kubernetes;

/// <summary>
/// Captures everything logged through it — formatted message, every structured state value and the full exception
/// text — so tests can assert a secret never reaches a log sink in any form.
/// </summary>
/// <typeparam name="T">Logger category.</typeparam>
public sealed class RecordingLogger<T> : ILogger<T>
{
    private readonly ConcurrentQueue<string> _entries = new();

    /// <summary>One string per log call, containing all of its rendered parts.</summary>
    public IReadOnlyList<string> Entries => [.. _entries];

    /// <summary>All entries joined, for "contains / does not contain" assertions.</summary>
    public string AllText => string.Join('\n', _entries);

    /// <inheritdoc />
    public IDisposable? BeginScope<TState>(TState state)
        where TState : notnull => null;

    /// <inheritdoc />
    public bool IsEnabled(LogLevel logLevel) => true;

    /// <inheritdoc />
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        ArgumentNullException.ThrowIfNull(formatter);
        var parts = new List<string> { $"{logLevel} {eventId}", formatter(state, exception) };
        if (state is IEnumerable<KeyValuePair<string, object?>> values)
        {
            parts.AddRange(values.Select(pair => $"{pair.Key}={pair.Value}"));
        }

        if (exception is not null)
        {
            parts.Add(exception.ToString());
        }

        _entries.Enqueue(string.Join(" | ", parts));
    }
}
