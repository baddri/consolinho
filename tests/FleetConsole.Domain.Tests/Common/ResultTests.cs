using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Tests.Common;

public sealed class ResultTests
{
    private static readonly Error SomeError = Error.NotFound("Things.NotFound", "Thing was not found.");

    [Fact]
    public void Success_IsSuccessWithoutError()
    {
        var result = Result.Success();

        result.IsSuccess.ShouldBeTrue();
        result.IsFailure.ShouldBeFalse();
        result.Error.ShouldBeNull();
    }

    [Fact]
    public void Failure_CarriesError()
    {
        var result = Result.Failure(SomeError);

        result.IsFailure.ShouldBeTrue();
        result.Error.ShouldBe(SomeError);
    }

    [Fact]
    public void ImplicitConversionFromError_CreatesFailure()
    {
        Result result = SomeError;

        result.IsFailure.ShouldBeTrue();
        result.Error.ShouldBe(SomeError);
    }

    [Fact]
    public void GenericSuccess_ExposesValue()
    {
        var result = Result.Success(42);

        result.IsSuccess.ShouldBeTrue();
        result.Value.ShouldBe(42);
    }

    [Fact]
    public void ImplicitConversionFromValue_CreatesSuccess()
    {
        Result<string> result = "hello";

        result.IsSuccess.ShouldBeTrue();
        result.Value.ShouldBe("hello");
    }

    [Fact]
    public void ImplicitConversionFromError_CreatesGenericFailure()
    {
        Result<string> result = SomeError;

        result.IsFailure.ShouldBeTrue();
        result.Error.ShouldBe(SomeError);
    }

    [Fact]
    public void Value_OnFailure_Throws()
    {
        var result = Result.Failure<int>(SomeError);

        var exception = Should.Throw<InvalidOperationException>(() => result.Value);
        exception.Message.ShouldContain("Things.NotFound");
    }

    [Fact]
    public void Failure_WithNullError_Throws()
    {
        Should.Throw<ArgumentNullException>(() => Result.Failure(null!));
        Should.Throw<ArgumentNullException>(() => Result.Failure<int>(null!));
    }

    [Fact]
    public void GenericResult_IsAResult()
    {
        Result result = Result.Success("x");

        result.ShouldBeOfType<Result<string>>();
    }
}
