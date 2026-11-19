using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Behaviors;
using FleetConsole.Domain.Common;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Messaging;

public sealed class AddApplicationTests
{
    [Fact]
    public void AddApplication_RegistersBehaviorsInDocumentedOrder()
    {
        var services = new ServiceCollection().AddApplication();

        var behaviors = services
            .Where(d => d.ServiceType == typeof(IPipelineBehavior<,>))
            .Select(d => d.ImplementationType)
            .ToArray();

        behaviors.ShouldBe(
        [
            typeof(LoggingBehavior<,>),
            typeof(AuthorizationBehavior<,>),
            typeof(ReadOnlyGuardBehavior<,>),
            typeof(ValidationBehavior<,>),
            typeof(UnitOfWorkBehavior<,>),
        ]);
        services.Where(d => d.ServiceType == typeof(IPipelineBehavior<,>)).ShouldAllBe(d => d.Lifetime == ServiceLifetime.Scoped);
    }

    [Fact]
    public void AddApplication_RegistersScopedDispatcher()
    {
        var services = new ServiceCollection().AddApplication();

        services.Single(d => d.ServiceType == typeof(IDispatcher)).Lifetime.ShouldBe(ServiceLifetime.Scoped);
    }

    [Fact]
    public void AddRequestHandlers_RegistersInternalHandlersAsScoped()
    {
        var services = new ServiceCollection().AddRequestHandlers(typeof(AddApplicationTests).Assembly);

        var descriptor = services.Single(d => d.ServiceType == typeof(IRequestHandler<EchoQuery, Result<string>>));
        descriptor.ImplementationType.ShouldBe(typeof(EchoQueryHandler));
        descriptor.Lifetime.ShouldBe(ServiceLifetime.Scoped);
    }

    [Fact]
    public void AddRequestHandlers_WhenARequestAlreadyHasAHandler_Throws()
    {
        var services = new ServiceCollection().AddRequestHandlers(typeof(AddApplicationTests).Assembly);

        var exception = Should.Throw<InvalidOperationException>(() => services.AddRequestHandlers(typeof(AddApplicationTests).Assembly));

        exception.Message.ShouldContain("exactly one handler");
    }
}
