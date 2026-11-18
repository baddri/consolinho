using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Tests.Common;

public sealed class ErrorTests
{
    public static TheoryData<Func<string, string, Error>, ErrorType> Factories => new()
    {
        { Error.Failure, ErrorType.Failure },
        { Error.Validation, ErrorType.Validation },
        { Error.NotFound, ErrorType.NotFound },
        { Error.Conflict, ErrorType.Conflict },
        { Error.Forbidden, ErrorType.Forbidden },
        { Error.Unauthorized, ErrorType.Unauthorized },
    };

    [Theory]
    [MemberData(nameof(Factories))]
    public void Factories_SetCodeMessageAndType(Func<string, string, Error> factory, ErrorType expectedType)
    {
        var error = factory("Area.Reason", "Something happened.");

        error.Code.ShouldBe("Area.Reason");
        error.Message.ShouldBe("Something happened.");
        error.Type.ShouldBe(expectedType);
    }

    [Fact]
    public void DefaultErrorType_IsFailure()
    {
        default(ErrorType).ShouldBe(ErrorType.Failure);
    }

    [Fact]
    public void Errors_WithSameValues_AreEqual()
    {
        Error.Conflict("A.B", "m").ShouldBe(Error.Conflict("A.B", "m"));
    }

    [Fact]
    public void FieldValidation_CreatesValidationErrorWithFieldErrors()
    {
        var error = Error.Validation(new Dictionary<string, string[]> { ["Name"] = ["Required."] });

        error.Type.ShouldBe(ErrorType.Validation);
        error.Code.ShouldBe(ValidationError.ValidationFailedCode);
        error.Errors["Name"].ShouldBe(["Required."]);
    }

    [Fact]
    public void ValidationError_WithoutFieldErrors_Throws()
    {
        Should.Throw<ArgumentException>(() => new ValidationError(new Dictionary<string, string[]>()));
    }
}
