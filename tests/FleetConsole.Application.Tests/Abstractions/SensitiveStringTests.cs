using System.Text.Json;
using FleetConsole.Application.Abstractions;

namespace FleetConsole.Application.Tests.Abstractions;

/// <summary>
/// <see cref="SensitiveString"/> must never render its value except through <see cref="SensitiveString.Reveal"/>
/// (ADR-0013 §11): not via ToString, interpolation, a containing record's generated ToString, or JSON serialization.
/// </summary>
public sealed class SensitiveStringTests
{
    private const string Secret = "fake-token-sensitive-string-test";

    /// <summary>Shaped like a command carrying a token.</summary>
    private sealed record CommandWithToken(string ClusterName, SensitiveString Token);

    [Fact]
    public void Reveal_ReturnsTheValue()
    {
        new SensitiveString(Secret).Reveal().ShouldBe(Secret);
    }

    [Fact]
    public void ToStringAndInterpolation_AreRedacted()
    {
        var value = new SensitiveString(Secret);

        value.ToString().ShouldBe("[redacted]");
        $"token={value}".ShouldBe("token=[redacted]");
    }

    [Fact]
    public void ContainingRecord_ToString_DoesNotPrintTheValue()
    {
        var command = new CommandWithToken("prod-eu-1", new SensitiveString(Secret));

        var text = command.ToString();

        text.ShouldNotContain(Secret);
        text.ShouldContain("Token = [redacted]");
        text.ShouldContain("prod-eu-1");
    }

    [Fact]
    public void JsonSerialization_DoesNotPrintTheValue()
    {
        var command = new CommandWithToken("prod-eu-1", new SensitiveString(Secret));

        JsonSerializer.Serialize(command).ShouldNotContain(Secret);
    }

    [Fact]
    public void Null_IsRejected()
    {
        Should.Throw<ArgumentNullException>(() => new SensitiveString(null!));
    }
}
