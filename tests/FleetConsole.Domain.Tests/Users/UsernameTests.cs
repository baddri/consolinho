using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Tests.Users;

public sealed class UsernameTests
{
    public static TheoryData<string> ValidNames =>
    [
        "alice",
        "Alice",
        "alice@example.com",
        "kube:admin",
        "system:serviceaccount:ns:sa",
        "a",
        "...",
        ".alice",
        "~alice",
        "élise",
        new string('a', Username.MaxLength),
    ];

    public static TheoryData<string?, string> InvalidNames => new()
    {
        { null, "Username is required." },
        { "", "Username is required." },
        { "   ", "Username is required." },
        { new string('a', Username.MaxLength + 1), "Username must be at most 253 characters long." },
        { ".", "Username can't be '.', '..' or '~'." },
        { "..", "Username can't be '.', '..' or '~'." },
        { "~", "Username can't be '.', '..' or '~'." },
        { "a/b", "Username can't contain '/', '%' or whitespace." },
        { "a%b", "Username can't contain '/', '%' or whitespace." },
        { "a b", "Username can't contain '/', '%' or whitespace." },
        { " alice", "Username can't contain '/', '%' or whitespace." },
        { "alice\t", "Username can't contain '/', '%' or whitespace." },
        { "alice\n", "Username can't contain '/', '%' or whitespace." },
        { "a b", "Username can't contain '/', '%' or whitespace." },
        { "a\u0000b", "Username can't contain control characters." },
        { "a\u007fb", "Username can't contain control characters." },
    };

    [Theory]
    [MemberData(nameof(ValidNames))]
    public void Create_AcceptsValidNames_Unchanged(string value)
    {
        var result = Username.Create(value);

        result.IsSuccess.ShouldBeTrue();
        result.Value.Value.ShouldBe(value);
        result.Value.ToString().ShouldBe(value);
    }

    [Theory]
    [MemberData(nameof(InvalidNames))]
    public void Create_RejectsInvalidNames_WithRuleMessage(string? value, string message)
    {
        var result = Username.Create(value);

        result.IsFailure.ShouldBeTrue();
        result.Error.Code.ShouldBe("Users.InvalidUsername");
        result.Error.Type.ShouldBe(ErrorType.Validation);
        result.Error.Message.ShouldBe(message);
    }

    [Fact]
    public void Equality_IsCaseSensitive()
    {
        Username.Create("alice").Value.ShouldBe(Username.Create("alice").Value);
        Username.Create("alice").Value.ShouldNotBe(Username.Create("Alice").Value);
    }
}
