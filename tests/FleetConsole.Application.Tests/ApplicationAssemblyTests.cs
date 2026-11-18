using FleetConsole.Application;

namespace FleetConsole.Application.Tests;

public sealed class ApplicationAssemblyTests
{
    [Fact]
    public void Assembly_IsTheApplicationAssembly()
    {
        ApplicationAssembly.Assembly.GetName().Name.ShouldBe("FleetConsole.Application");
    }
}
