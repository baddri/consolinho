using FleetConsole.Api.Tests.Integration;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;
using FleetConsole.Domain.Users.Events;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using static FleetConsole.Api.Tests.Persistence.PersistenceTestData;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// AUD-1 / QA R5 against real PostgreSQL with the production <see cref="ConsoleDbContext"/>, repositories, dispatcher and
/// audit handlers (ADR-0008): a change and its audit entry are written together or not at all, a failing or misbehaving
/// event handler aborts the save, and events are dispatched once.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AuditAtomicityTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task SavingAPreCreatedUser_WritesTheUserAndExactlyOneUserCreatedEntry_InOneTransaction()
    {
        var user = NewUser();

        await using (var scope = factory.Services.CreateSignedInScope("atomicity-admin"))
        {
            scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(user);
            await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        }

        (await CountAsync("select count(*) from users where id = @id", user.Id.Value)).ShouldBe(1);
        (await CountAsync("select count(*) from audit_entries where target_id = @id::text", user.Id.Value)).ShouldBe(1);
        (await TextAsync("select action from audit_entries where target_id = @id::text", user.Id.Value)).ShouldBe("user.created");
        (await TextAsync("select actor_name from audit_entries where target_id = @id::text", user.Id.Value)).ShouldBe("atomicity-admin");
        (await TextAsync("select related_username from audit_entries where target_id = @id::text", user.Id.Value)).ShouldBe(user.Username.Value);

        // xmin of a freshly inserted row is the inserting transaction's id: equal values prove one transaction.
        var userXmin = await TextAsync("select xmin::text from users where id = @id", user.Id.Value);
        var entryXmin = await TextAsync("select xmin::text from audit_entries where target_id = @id::text", user.Id.Value);
        entryXmin.ShouldBe(userXmin);
    }

    [Fact]
    public async Task AFailingSave_WritesNeitherTheChangeNorItsAuditEntry()
    {
        var username = NewUsername();
        await using (var scope = factory.Services.CreateSignedInScope())
        {
            scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(NewUser(username: username));
            await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        }

        var duplicate = NewUser(username: username);
        await using (var scope = factory.Services.CreateSignedInScope())
        {
            scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(duplicate);
            await Should.ThrowAsync<DuplicateKeyException>(
                () => scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct));
        }

        (await CountAsync("select count(*) from users where id = @id", duplicate.Id.Value)).ShouldBe(0);
        (await CountAsync("select count(*) from audit_entries where target_id = @id::text", duplicate.Id.Value)).ShouldBe(0);
        (await CountAsync("select count(*) from audit_entries where related_username = @name", username.Value))
            .ShouldBe(1, "only the first user's user.created entry exists");
    }

    [Fact]
    public async Task AThrowingEventHandler_AbortsTheSave_NothingIsWritten()
    {
        await using var host = HostWith<ThrowingUserCreatedHandler>();
        var user = NewUser();

        await using (var scope = host.Services.CreateSignedInScope())
        {
            scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(user);

            // A handler failure is a bug: it is not translated into a persistence exception (it becomes a 500).
            var exception = await Should.ThrowAsync<InvalidOperationException>(
                () => scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct));
            exception.Message.ShouldBe(ThrowingUserCreatedHandler.Message);
        }

        (await CountAsync("select count(*) from users where id = @id", user.Id.Value)).ShouldBe(0);
        (await CountAsync("select count(*) from audit_entries where target_id = @id::text", user.Id.Value))
            .ShouldBe(0, "the audit handler ran first and staged its entry, but nothing was written");
    }

    [Fact]
    public async Task AHandlerThatRaisesANewEvent_IsRejected_NothingIsWritten()
    {
        await using var host = HostWith<EventRaisingUserCreatedHandler>();
        var user = NewUser();

        await using (var scope = host.Services.CreateSignedInScope())
        {
            scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(user);

            var exception = await Should.ThrowAsync<InvalidOperationException>(
                () => scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct));
            exception.Message.ShouldContain(nameof(User));
            exception.Message.ShouldContain(nameof(UserReadOnlyChanged));
        }

        (await CountAsync("select count(*) from users where id = @id", user.Id.Value)).ShouldBe(0);
        (await CountAsync("select count(*) from audit_entries where target_id = @id::text", user.Id.Value)).ShouldBe(0);
    }

    [Fact]
    public async Task EventsAreClearedAfterASuccessfulSave_ASecondSaveWritesNoExtraEntry()
    {
        var user = NewUser();

        await using (var scope = factory.Services.CreateSignedInScope())
        {
            scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(user);
            var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            await unitOfWork.SaveChangesAsync(Ct);

            user.DomainEvents.ShouldBeEmpty();
            await unitOfWork.SaveChangesAsync(Ct);
        }

        (await CountAsync("select count(*) from audit_entries where target_id = @id::text", user.Id.Value)).ShouldBe(1);
    }

    [Fact]
    public async Task SeveralEntriesWithTheSharedConfigurationActor_InOneSave_AreAllWrittenWithTheirActor()
    {
        // Regression: AuditActor.Configuration is one static instance and the actor is an owned value of the entry.
        var users = Enumerable.Range(0, 3).Select(_ => User.Provision(NewUsername("cfg"), Now)).ToList();
        foreach (var user in users)
        {
            user.RecordLogin(null, ["fleetconsole-admins"], "group fleetconsole-admins", provisioned: true, Now).IsSuccess.ShouldBeTrue();
        }

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            foreach (var user in users)
            {
                scope.ServiceProvider.GetRequiredService<IUserRepository>().Add(user);
            }

            await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        }

        foreach (var user in users)
        {
            (await TextAsync("select actor_name from audit_entries where action = 'user.promoted' and target_id = @id::text", user.Id.Value))
                .ShouldBe(AuditActor.ConfigurationName);
        }
    }

    /// <summary>A separate in-process host (same database) with one extra event handler registered after the audit ones.</summary>
    private WebApplicationFactory<Program> HostWith<THandler>()
        where THandler : class, IDomainEventHandler<UserCreated> =>
        factory.WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services => services.AddScoped<IDomainEventHandler<UserCreated>, THandler>()));

    private async Task<long> CountAsync(string sql, object value) => (long)(await ScalarAsync(sql, value))!;

    private async Task<string?> TextAsync(string sql, object value) => (string?)await ScalarAsync(sql, value);

    private async Task<object?> ScalarAsync(string sql, object value)
    {
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue(sql.Contains("@name", StringComparison.Ordinal) ? "name" : "id", value);
        return await command.ExecuteScalarAsync(Ct);
    }

    /// <summary>A broken handler: it always throws.</summary>
    internal sealed class ThrowingUserCreatedHandler : IDomainEventHandler<UserCreated>
    {
        public const string Message = "Simulated handler failure.";

        public Task Handle(UserCreated domainEvent, CancellationToken cancellationToken) =>
            throw new InvalidOperationException(Message);
    }

    /// <summary>A handler breaking ADR-0008's rule by changing the aggregate it was told about (raising a new event).</summary>
    internal sealed class EventRaisingUserCreatedHandler(ConsoleDbContext db) : IDomainEventHandler<UserCreated>
    {
        public Task Handle(UserCreated domainEvent, CancellationToken cancellationToken)
        {
            var user = db.ChangeTracker.Entries<User>().Single(e => e.Entity.Id == domainEvent.UserId).Entity;
            user.SetReadOnly(!domainEvent.IsReadOnly, activeWritableAdminCount: 10).IsSuccess.ShouldBeTrue();
            return Task.CompletedTask;
        }
    }
}
