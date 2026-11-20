using FleetConsole.Application.Abstractions.Events;
using FleetConsole.Application.Audit.EventHandlers;
using FleetConsole.Domain;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Audit;

/// <summary>
/// AUD-1 by construction (ADR-0008 §5): every domain event is audited. Adding an event without an audit mapping fails
/// here, before it can reach production.
/// </summary>
public sealed class AuditCoverageTests
{
    /// <summary>
    /// Domain events deliberately not audited, each with a reason. Expected to stay empty in CP1: every event is an
    /// auditable admin or login action.
    /// </summary>
    private static readonly HashSet<Type> NotAudited = [];

    private static readonly string AuditHandlerNamespace = typeof(UserAuditHandler).Namespace!;

    public static TheoryData<Type> DomainEvents()
    {
        var data = new TheoryData<Type>();
        foreach (var type in DomainEventTypes())
        {
            data.Add(type);
        }

        return data;
    }

    [Fact]
    public void TheDomainHasEvents() => DomainEventTypes().Count.ShouldBeGreaterThanOrEqualTo(19);

    [Theory]
    [MemberData(nameof(DomainEvents))]
    public void EveryDomainEvent_HasAnAuditHandler(Type eventType)
    {
        if (NotAudited.Contains(eventType))
        {
            return;
        }

        var handlerContract = typeof(IDomainEventHandler<>).MakeGenericType(eventType);
        var auditHandlers = ApplicationAssembly.Assembly.GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false } && t.Namespace == AuditHandlerNamespace)
            .Where(handlerContract.IsAssignableFrom)
            .ToList();

        auditHandlers.ShouldNotBeEmpty($"{eventType.Name} has no IDomainEventHandler in {AuditHandlerNamespace}.");
    }

    [Theory]
    [MemberData(nameof(DomainEvents))]
    public async Task EveryDomainEvent_HasItsAuditHandlerRegisteredByAddApplication(Type eventType)
    {
        await using var provider = ServiceProviderBuilder.Build();
        await using var scope = provider.CreateAsyncScope();

        var handlers = scope.ServiceProvider.GetServices(typeof(IDomainEventHandler<>).MakeGenericType(eventType));

        handlers.ShouldContain(h => h!.GetType().Namespace == AuditHandlerNamespace);
    }

    [Theory]
    [MemberData(nameof(DomainEvents))]
    public void NoDomainEvent_CarriesTokenMaterial(Type eventType)
    {
        // Events feed the audit details; tokens are identified by fingerprint only (ADR-0004). An event property that
        // could hold a token (encrypted or plain) would be one mapping mistake away from the audit log.
        foreach (var property in eventType.GetProperties())
        {
            property.PropertyType.ShouldNotBe(typeof(EncryptedToken), $"{eventType.Name}.{property.Name}");
            property.PropertyType.ShouldNotBe(typeof(byte[]), $"{eventType.Name}.{property.Name}");
            if (property.PropertyType == typeof(string))
            {
                property.Name.ShouldNotContain("Token", Case.Insensitive, $"{eventType.Name}.{property.Name}");
            }
        }
    }

    private static List<Type> DomainEventTypes() =>
        DomainAssembly.Assembly.GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false } && typeof(IDomainEvent).IsAssignableFrom(t))
            .OrderBy(t => t.FullName, StringComparer.Ordinal)
            .ToList();
}
