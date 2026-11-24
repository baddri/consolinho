using System.Collections;
using System.Linq.Expressions;
using System.Net;
using System.Net.Sockets;
using FleetConsole.Api.Http;
using FleetConsole.Api.Tests.Integration.Proxy;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Common;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// CACHE-5 error path (ADR-0040 §8) end to end: with the database unreachable, a signed-in user's admin-free reads and
/// proxy requests answer 503 <c>Persistence.Unavailable</c> instead of a 500, without leaking secrets.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class PersistenceUnavailableTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task DatabaseUnreachable_ClusterListAndProxy_Answer503PersistenceUnavailable()
    {
        // Retries off: Aspire's retrying strategy would back off for a minute before giving up (that path,
        // RetryLimitExceededException, is covered by the translation unit tests below).
        await using var host = await factory.CreateVariantAsync(
            new Dictionary<string, string?> { ["Aspire:Npgsql:EntityFrameworkCore:PostgreSQL:DisableRetry"] = "true" });
        var cluster = await host.Data.ClusterAsync();
        // The proxy client emulates Kestrel's raw request target, which the proxy route needs; /api/clusters works with it too.
        using var client = await ProxyTestClient.LoginAsync(host, host.NewUsername());
        var accessToken = host.HostStub.IssuedAccessTokens[^1];
        var password = new NpgsqlConnectionStringBuilder(host.ConnectionString).Password.ShouldNotBeNull();

        // The context reads its connection string per scope: from now on every query hits a closed port.
        host.Services.GetRequiredService<IConfiguration>()[$"ConnectionStrings:{ConsoleDbContext.ConnectionName}"] =
            new NpgsqlConnectionStringBuilder(host.ConnectionString) { Port = ClosedPort() }.ConnectionString;

        var bodies = new List<string>();
        foreach (var path in new[] { "/api/clusters", $"/api/clusters/{cluster.Name}/k8s/api/v1/pods?limit=5" })
        {
            using var response = await client.Http.GetAsync(ProxyTestClient.RawUri(path), Ct);
            var body = await response.Content.ReadAsStringAsync(Ct);
            bodies.Add(body);

            response.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable, $"{path}: {body}");
            response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
            response.Headers.RetryAfter.ShouldNotBeNull().Delta.ShouldBe(TimeSpan.FromSeconds(5));
            body.ShouldContain($"\"{ResultExtensions.ErrorCodeExtension}\":\"{PersistenceErrors.UnavailableCode}\"");
        }

        host.Logs.Entries.Count(e => e.Level == LogLevel.Warning && e.EventId == 2003).ShouldBe(2);
        TokenLeakScanner.AssertAbsent(accessToken, [.. bodies, host.Logs.AllText]);
        TokenLeakScanner.AssertAbsent(host.ConnectionString, [.. bodies, host.Logs.AllText]);
        bodies.ShouldAllBe(body => !body.Contains($"Password={password}", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>A loopback port nothing listens on (bound once, then released), so connecting is refused at once.</summary>
    private static int ClosedPort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}

/// <summary>Unit tests of the Infrastructure translation into <see cref="PersistenceUnavailableException"/> (no database).</summary>
public sealed class PersistenceUnavailableTranslationTests
{
    public static TheoryData<Exception> Unavailable() => new()
    {
        new NpgsqlException("Failed to connect", new SocketException((int)SocketError.ConnectionRefused)),
        new NpgsqlException("Exception while reading from stream", new TimeoutException()),
        new TimeoutException(),
        new RetryLimitExceededException("Retries exhausted", new NpgsqlException("x", new SocketException())),
        new PostgresException("the database system is starting up", "FATAL", "FATAL", PostgresErrorCodes.CannotConnectNow),
        new DbUpdateException("write failed", new NpgsqlException("x", new SocketException())),
    };

    public static TheoryData<Exception> NotUnavailable() => new()
    {
        new PostgresException("duplicate key", "ERROR", "ERROR", PostgresErrorCodes.UniqueViolation),
        new PostgresException("syntax error", "ERROR", "ERROR", PostgresErrorCodes.SyntaxError),
        new DbUpdateException("write failed", new PostgresException("fk", "ERROR", "ERROR", PostgresErrorCodes.ForeignKeyViolation)),
        new InvalidOperationException("bug"),
        new OperationCanceledException(),
    };

    [Theory]
    [MemberData(nameof(Unavailable))]
    public async Task ReadModel_TranslatesConnectivityFailures(Exception failure)
    {
        using var db = NewContext();
        var readModel = new ReadModel(db);

        var thrown = await Should.ThrowAsync<PersistenceUnavailableException>(
            () => readModel.ToListAsync(new ThrowingQueryable<int>(failure), TestContext.Current.CancellationToken));

        thrown.InnerException.ShouldBeSameAs(failure);
        thrown.Message.ShouldBe("The database could not be reached.");
    }

    [Theory]
    [MemberData(nameof(NotUnavailable))]
    public async Task ReadModel_LeavesOtherFailuresUnchanged(Exception failure)
    {
        using var db = NewContext();
        var readModel = new ReadModel(db);

        var thrown = await Should.ThrowAsync<Exception>(
            () => readModel.ToListAsync(new ThrowingQueryable<int>(failure), TestContext.Current.CancellationToken));

        // Awaiting a cancelled task surfaces a TaskCanceledException, so compare by type, not identity.
        thrown.ShouldBeAssignableTo(failure.GetType());
        thrown.ShouldNotBeOfType<PersistenceUnavailableException>();
    }

    [Theory]
    [MemberData(nameof(Unavailable))]
    public void Classification_MatchesTheUnitOfWorkBoundary(Exception failure) =>
        ConsoleDbContext.IsUnavailable(failure).ShouldBeTrue();

    [Theory]
    [MemberData(nameof(NotUnavailable))]
    public void Classification_RejectsNonConnectivityFailures(Exception failure) =>
        ConsoleDbContext.IsUnavailable(failure).ShouldBeFalse();

    private static ConsoleDbContext NewContext()
    {
        var options = new DbContextOptionsBuilder<ConsoleDbContext>();
        ConsoleDbContext.ConfigureProvider(options, connectionString: null);
        return new ConsoleDbContext(options.Options, new NoDispatcher());
    }

    private sealed class NoDispatcher : IDomainEventDispatcher
    {
        public Task DispatchAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task DispatchPostCommitAsync(IReadOnlyList<IDomainEvent> domainEvents, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    /// <summary>An async-enumerable query whose execution throws <paramref name="failure"/>, like a failing database call.</summary>
    private sealed class ThrowingQueryable<T>(Exception failure) : IQueryable<T>, IAsyncEnumerable<T>
    {
        public Type ElementType => typeof(T);

        public Expression Expression => Expression.Constant(this);

        public IQueryProvider Provider => throw new NotSupportedException();

        public IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken cancellationToken = default) => throw failure;

        public IEnumerator<T> GetEnumerator() => throw failure;

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
