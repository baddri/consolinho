using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Domain.Tests.Users;

public sealed class UserErrorsTests
{
    public static TheoryData<Error, string, ErrorType, string> Errors => new()
    {
        { UserErrors.NotFound("alice"), "Users.NotFound", ErrorType.NotFound, "User alice was not found." },
        { UserErrors.UsernameTaken("alice"), "Users.UsernameTaken", ErrorType.Conflict, "User alice already exists." },
        {
            UserErrors.LastAdmin("alice"), "Users.LastAdmin", ErrorType.Conflict,
            "alice is the last active administrator who can make changes. Promote another user first."
        },
        {
            UserErrors.SelfChange(), "Users.SelfChange", ErrorType.Conflict,
            "You can't demote or deactivate yourself. Ask another administrator."
        },
        {
            UserErrors.AdminViaConfiguration(AdminConfigurationSource.ForGroup("fleetconsole-admins")), "Users.AdminViaConfiguration", ErrorType.Conflict,
            "Admin granted by configuration (group fleetconsole-admins). Change the configuration to remove."
        },
        { UserErrors.Deactivated(), "Users.Deactivated", ErrorType.Forbidden, "Your Consolinho account is deactivated." },
    };

    [Theory]
    [MemberData(nameof(Errors))]
    public void Errors_MatchTheContractCatalogue(Error error, string code, ErrorType type, string message)
    {
        error.Code.ShouldBe(code);
        error.Type.ShouldBe(type);
        error.Message.ShouldBe(message);
    }
}
