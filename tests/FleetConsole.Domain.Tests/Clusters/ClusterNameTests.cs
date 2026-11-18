using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Tests.Clusters;

public sealed class ClusterNameTests
{
    private const string RuleMessage =
        "Use lowercase letters, digits and '-' (max 40), starting and ending with a letter or digit.";

    public static TheoryData<string> ValidNames =>
    [
        "a",
        "0",
        "prod-eu-1",
        "a-b-c",
        "a--b",
        "123",
        new string('a', ClusterName.MaxLength),
    ];

    public static TheoryData<string?, string> InvalidNames => new()
    {
        { null, "Name is required." },
        { "", "Name is required." },
        { "  ", "Name is required." },
        { new string('a', ClusterName.MaxLength + 1), RuleMessage },
        { "Prod", RuleMessage },
        { "-prod", RuleMessage },
        { "prod-", RuleMessage },
        { "prod_eu", RuleMessage },
        { "prod.eu", RuleMessage },
        { " prod", RuleMessage },
        { "prod\n", RuleMessage },
        { "prød", RuleMessage },
    };

    [Theory]
    [MemberData(nameof(ValidNames))]
    public void Create_AcceptsDnsLabels(string value)
    {
        var result = ClusterName.Create(value);

        result.IsSuccess.ShouldBeTrue();
        result.Value.Value.ShouldBe(value);
        result.Value.ToString().ShouldBe(value);
    }

    [Theory]
    [MemberData(nameof(InvalidNames))]
    public void Create_RejectsInvalidNames_WithFieldMessage(string? value, string message)
    {
        var result = ClusterName.Create(value);

        result.IsFailure.ShouldBeTrue();
        result.Error.Code.ShouldBe("Clusters.InvalidName");
        result.Error.Type.ShouldBe(ErrorType.Validation);
        result.Error.Message.ShouldBe(message);
    }

    [Fact]
    public void Equality_IsByValue()
    {
        ClusterName.Create("prod").Value.ShouldBe(ClusterName.Create("prod").Value);
        ClusterName.Create("prod").Value.ShouldNotBe(ClusterName.Create("dev").Value);
    }
}
