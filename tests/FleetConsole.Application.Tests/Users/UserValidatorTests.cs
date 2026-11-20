using FleetConsole.Application.Users.ChangeUserRole;
using FleetConsole.Application.Users.CreateUser;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Tests.Users;

/// <summary>Field rules of the user commands (USR-2 username rules come from <see cref="Username.Create"/>).</summary>
public sealed class UserValidatorTests
{
    [Theory]
    [InlineData("alice")]
    [InlineData("Alice")]
    [InlineData("system:serviceaccount:ns:sa")]
    [InlineData("jane.doe@example.com")]
    public void Create_ValidUsername_Passes(string username) =>
        new CreateUserValidator().Validate(new CreateUserCommand(username, UserRole.User, false)).IsValid.ShouldBeTrue();

    [Theory]
    [InlineData("", "Username is required.")]
    [InlineData("a/b", "Username can't contain '/', '%' or whitespace.")]
    [InlineData("a b", "Username can't contain '/', '%' or whitespace.")]
    [InlineData("a%b", "Username can't contain '/', '%' or whitespace.")]
    public void Create_InvalidUsername_FailsOnUsernameField(string username, string message)
    {
        var result = new CreateUserValidator().Validate(new CreateUserCommand(username, UserRole.User, false));

        var failure = result.Errors.ShouldHaveSingleItem();
        failure.PropertyName.ShouldBe(nameof(CreateUserCommand.Username));
        failure.ErrorMessage.ShouldBe(message);
    }

    [Theory]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData("~")]
    public void Create_ReservedUsername_Fails(string username) =>
        new CreateUserValidator().Validate(new CreateUserCommand(username, UserRole.User, false)).IsValid.ShouldBeFalse();

    [Fact]
    public void Create_TooLongUsername_Fails() =>
        new CreateUserValidator().Validate(new CreateUserCommand(new string('a', 254), UserRole.User, false)).IsValid.ShouldBeFalse();

    [Fact]
    public void Create_UndefinedRole_Fails() =>
        new CreateUserValidator().Validate(new CreateUserCommand("alice", (UserRole)42, false))
            .Errors.ShouldHaveSingleItem().PropertyName.ShouldBe(nameof(CreateUserCommand.Role));

    [Fact]
    public void ChangeRole_UndefinedRole_Fails() =>
        new ChangeUserRoleValidator().Validate(new ChangeUserRoleCommand("alice", (UserRole)42, 1)).IsValid.ShouldBeFalse();
}
