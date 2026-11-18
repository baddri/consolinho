using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Tests.Common;

public sealed class GuardTests
{
    [Fact]
    public void NotNull_ReturnsValue_OrThrowsWithParameterName()
    {
        var value = "x";
        string? missing = null;

        Guard.NotNull(value).ShouldBe("x");
        Should.Throw<ArgumentNullException>(() => Guard.NotNull(missing)).ParamName.ShouldBe(nameof(missing));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void NotNullOrWhiteSpace_RejectsBlank(string? value)
    {
        Should.Throw<ArgumentException>(() => Guard.NotNullOrWhiteSpace(value));
    }

    [Fact]
    public void MaxLength_AllowsBoundary_RejectsLonger()
    {
        Guard.MaxLength("abc", 3).ShouldBe("abc");
        Should.Throw<ArgumentOutOfRangeException>(() => Guard.MaxLength("abcd", 3));
    }

    [Fact]
    public void NotEmpty_RejectsEmptyGuid()
    {
        var id = Guid.NewGuid();

        Guard.NotEmpty(id).ShouldBe(id);
        Should.Throw<ArgumentException>(() => Guard.NotEmpty(Guid.Empty));
    }

    [Fact]
    public void NotDefault_RejectsDefaultStruct()
    {
        Guard.NotDefault(5).ShouldBe(5);
        Should.Throw<ArgumentException>(() => Guard.NotDefault(default(DateTimeOffset)));
    }

    [Fact]
    public void InRange_IsInclusive()
    {
        Guard.InRange(1, 1, 3).ShouldBe(1);
        Guard.InRange(3, 1, 3).ShouldBe(3);
        Should.Throw<ArgumentOutOfRangeException>(() => Guard.InRange(4, 1, 3));
        Should.Throw<ArgumentOutOfRangeException>(() => Guard.InRange(0, 1, 3));
    }
}
