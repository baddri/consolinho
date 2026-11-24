using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Access;
using FleetConsole.Application.Access.LoadAccessSnapshot;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace FleetConsole.Application.Tests.Access;

/// <summary>
/// Builds a <see cref="ClusterAccessReader"/> over an in-memory <see cref="IReadModel"/>: its dispatcher runs
/// <see cref="LoadAccessSnapshotHandler"/> directly (no cache), so every call sees the model's current rows.
/// </summary>
internal static class TestAccessReader
{
    /// <summary>A reader whose snapshot loads from <paramref name="model"/> on every call.</summary>
    /// <param name="model">The read model the snapshot handler queries.</param>
    /// <param name="logger">Receives the tie warning; a null logger when omitted.</param>
    /// <returns>The reader.</returns>
    public static ClusterAccessReader Create(IReadModel model, ILogger<ClusterAccessReader>? logger = null) =>
        new(new SnapshotDispatcher(model), logger ?? NullLogger<ClusterAccessReader>.Instance);

    /// <summary>Answers <see cref="LoadAccessSnapshotQuery"/> only; anything else is a test bug.</summary>
    private sealed class SnapshotDispatcher(IReadModel model) : IDispatcher
    {
        public async Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken)
        {
            var query = request as LoadAccessSnapshotQuery
                ?? throw new NotSupportedException($"Unexpected request {request.GetType().Name}.");
            var result = await new LoadAccessSnapshotHandler(model).Handle(query, cancellationToken);
            return (TResponse)(object)result;
        }
    }
}
