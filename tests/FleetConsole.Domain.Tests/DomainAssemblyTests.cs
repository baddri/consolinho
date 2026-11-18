using FleetConsole.Domain;

namespace FleetConsole.Domain.Tests;

public sealed class DomainAssemblyTests
{
    [Fact]
    public void Assembly_IsTheDomainAssembly()
    {
        DomainAssembly.Assembly.GetName().Name.ShouldBe("FleetConsole.Domain");
    }
}
