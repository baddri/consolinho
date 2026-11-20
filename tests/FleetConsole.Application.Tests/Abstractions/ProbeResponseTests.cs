using FleetConsole.Application.Abstractions.Kubernetes;

namespace FleetConsole.Application.Tests.Abstractions;

/// <summary><see cref="ProbeResponse{T}"/> holds exactly one of a value or a failure.</summary>
public sealed class ProbeResponseTests
{
    [Fact]
    public void Ok_IsSuccess_WithValue()
    {
        var response = ProbeResponse<KubernetesVersionInfo>.Ok(new KubernetesVersionInfo("v1.31.4"));

        response.IsSuccess.ShouldBeTrue();
        response.Value.ShouldBe(new KubernetesVersionInfo("v1.31.4"));
        response.Failure.ShouldBeNull();
    }

    [Fact]
    public void Fail_IsFailure_WithFailure()
    {
        var failure = new ProbeFailure(ProbeFailureKind.Unauthorized, "rejected");

        var response = ProbeResponse<KubernetesVersionInfo>.Fail(failure);

        response.IsSuccess.ShouldBeFalse();
        response.Failure.ShouldBe(failure);
        response.Value.ShouldBeNull();
    }

    [Fact]
    public void NullArguments_AreRejected()
    {
        Should.Throw<ArgumentNullException>(() => ProbeResponse<KubernetesVersionInfo>.Ok(null!));
        Should.Throw<ArgumentNullException>(() => ProbeResponse<KubernetesVersionInfo>.Fail(null!));
    }
}
