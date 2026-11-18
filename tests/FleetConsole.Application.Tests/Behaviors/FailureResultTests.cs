using FleetConsole.Application.Behaviors;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Tests.Behaviors;

public sealed class FailureResultTests
{
    private static readonly Error SomeError = Error.Conflict("A.B", "c");

    [Fact]
    public void Create_ForResult_ReturnsFailedResult()
    {
        FailureResult<Result>.Create(SomeError).Error.ShouldBe(SomeError);
    }

    [Fact]
    public void Create_ForGenericResult_ReturnsFailedGenericResult()
    {
        var result = FailureResult<Result<int>>.Create(SomeError);

        result.ShouldBeOfType<Result<int>>().Error.ShouldBe(SomeError);
    }

    [Fact]
    public void Create_ForNonResultType_Throws()
    {
        FailureResult<string>.IsSupported.ShouldBeFalse();
        Should.Throw<InvalidOperationException>(() => FailureResult<string>.Create(SomeError));
    }
}
