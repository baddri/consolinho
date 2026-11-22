using FleetConsole.Application.Clusters.RegisterCluster;
using FleetConsole.Application.Clusters.UpdateCluster;
using FleetConsole.Domain.Clusters;
using FluentValidation.Results;

namespace FleetConsole.Application.Tests.Clusters;

/// <summary>
/// The register/update validators map contract §8.2 rules to field errors whose property names become the JSON keys
/// (the Api camelCases each segment). Connection errors are copied from <c>ApiServerEndpoint.Create</c> under its own
/// keys.
/// </summary>
public sealed class ClusterValidatorTests
{
    private static RegisterClusterCommand Register(
        string name = "prod-east",
        string? displayName = null,
        string apiUrl = "https://api.prod-east.example.com:6443",
        ClusterEnvironment environment = ClusterEnvironment.Production,
        ClusterDistribution? distribution = ClusterDistribution.OpenShift,
        string? webConsoleUrl = null,
        string? description = null,
        string? caBundle = null,
        bool skipTlsVerify = false) =>
        new(name, displayName, apiUrl, environment, distribution, webConsoleUrl, description, caBundle, skipTlsVerify, IsEnabled: true);

    private static string[] Keys(ValidationResult result) =>
        result.Errors.Select(e => char.ToLowerInvariant(e.PropertyName[0]) + e.PropertyName[1..]).Distinct().ToArray();

    [Fact]
    public void ValidCommand_HasNoErrors() =>
        new RegisterClusterValidator().Validate(Register(
            displayName: "  Prod East  ", webConsoleUrl: " https://console.example.com ", description: "x", skipTlsVerify: true))
            .IsValid.ShouldBeTrue();

    public static TheoryData<RegisterClusterCommand, string> InvalidCommands => new()
    {
        { Register(name: "Bad_Name"), "name" },
        { Register(name: ""), "name" },
        { Register(displayName: new string('d', 101)), "displayName" },
        { Register(environment: (ClusterEnvironment)42), "environment" },
        { Register(distribution: null), "distribution" },
        { Register(distribution: (ClusterDistribution)42), "distribution" },
        { Register(webConsoleUrl: "http://console.example.com"), "webConsoleUrl" },
        { Register(webConsoleUrl: "relative/path"), "webConsoleUrl" },
        { Register(webConsoleUrl: "https://console.example.com/" + new string('p', 2048)), "webConsoleUrl" },
        { Register(description: new string('x', 1001)), "description" },
        { Register(apiUrl: "http://api.example.com"), "apiUrl" },
        { Register(apiUrl: "https://api.example.com/path"), "apiUrl" },
        { Register(caBundle: "not a pem"), "caBundle" },
        { Register(caBundle: "-----BEGIN CERTIFICATE-----\nbm90IGEgY2VydA==\n-----END CERTIFICATE-----"), "caBundle" },
    };

    [Theory]
    [MemberData(nameof(InvalidCommands))]
    public void InvalidField_IsReportedUnderItsJsonKey(RegisterClusterCommand command, string key)
    {
        var result = new RegisterClusterValidator().Validate(command);

        Keys(result).ShouldBe([key]);
    }

    [Fact]
    public void MissingDistribution_HasOneFieldError_WithTheContractMessage()
    {
        var result = new RegisterClusterValidator().Validate(Register(distribution: null));

        result.Errors.ShouldHaveSingleItem().ErrorMessage.ShouldBe("Choose OpenShift or Kubernetes.");
    }

    [Fact]
    public void Lengths_AreCheckedAfterTrimming()
    {
        var padded = "  " + new string('d', 100) + "  ";

        new RegisterClusterValidator().Validate(Register(displayName: padded, description: padded)).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Update_UsesTheSharedRules()
    {
        var command = new UpdateClusterCommand(
            "prod-east", null, "http://api.example.com", ClusterEnvironment.Staging, null, "ftp://x", null, null, false, Version: 1);

        Keys(new UpdateClusterValidator().Validate(command)).ShouldBe(["distribution", "webConsoleUrl", "apiUrl"], ignoreOrder: true);
    }
}
