using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Auth.CompleteLogin;

/// <summary>
/// The facts the Api's <c>SessionPrincipalFactory</c> turns into session claims after an allowed login (ADR-0009):
/// id, name, effective role, read-only flag and security stamp. Internal plumbing, not an HTTP DTO.
/// </summary>
/// <remarks>
/// Named <c>SignedInUserDto</c>, not <c>SessionUserDto</c> as first designed: the Api already has a <c>SessionUser</c>
/// type, and the schema-naming rule (a <c>FooDto</c> must not coexist with a <c>Foo</c>) forbids the pair. T-0015 maps
/// this to the Api's <c>SessionUser</c> for <c>SessionPrincipalFactory.Create</c>.
/// </remarks>
/// <param name="UserId">The FleetConsole user id.</param>
/// <param name="Username">The username.</param>
/// <param name="Role">The effective role after this login (configuration evaluated).</param>
/// <param name="IsReadOnly">The global read-only flag.</param>
/// <param name="SecurityStamp">The stamp copied into the session; revalidation compares it.</param>
public sealed record SignedInUserDto(UserId UserId, string Username, UserRole Role, bool IsReadOnly, Guid SecurityStamp);
