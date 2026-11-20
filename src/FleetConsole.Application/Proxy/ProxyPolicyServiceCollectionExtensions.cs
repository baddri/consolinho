using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Proxy;

/// <summary>Registration helper for <see cref="IProxyPolicy"/> implementations.</summary>
public static class ProxyPolicyServiceCollectionExtensions
{
    /// <summary>
    /// Adds <typeparamref name="TPolicy"/> to the proxy policy chain as a scoped service. Policies are evaluated in the
    /// order they are registered (the order <c>IEnumerable&lt;IProxyPolicy&gt;</c> resolves them), so the call order is
    /// part of the contract — e.g. the read-only checks must precede the body-size check.
    /// </summary>
    /// <typeparam name="TPolicy">The policy type.</typeparam>
    /// <param name="services">The service collection.</param>
    /// <returns>The same collection, for chaining.</returns>
    public static IServiceCollection AddProxyPolicy<TPolicy>(this IServiceCollection services)
        where TPolicy : class, IProxyPolicy
    {
        ArgumentNullException.ThrowIfNull(services);
        services.AddScoped<IProxyPolicy, TPolicy>();
        return services;
    }
}
