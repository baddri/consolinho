using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Application.Grants.BulkGroupGrant;
using FleetConsole.Application.Grants.CreateGroupGrant;
using FleetConsole.Application.Grants.UpdateGrant;
using FleetConsole.Domain.Access;

namespace FleetConsole.Application.Tests.Grants;

/// <summary>Shape rules of the group grant commands (CP4.5 contract §3, GRP-2/3/6): group name, priority range, bulk items.</summary>
public sealed class GroupGrantValidatorTests
{
    private static readonly CreateGroupGrantValidator Create = new();
    private static readonly BulkGroupGrantValidator Bulk = new();

    [Theory]
    [InlineData("system:authenticated", "System groups can't be granted access.")]
    [InlineData("SYSTEM:Masters", "System groups can't be granted access.")]
    [InlineData("a/b", "Enter a valid group name.")]
    [InlineData("..", "Enter a valid group name.")]
    [InlineData("  ", "Enter a valid group name.")]
    public void Invalid_group_name_is_one_groupName_error(string name, string message)
    {
        Create.Validate(CreateOf(name, priority: 1)).Errors.ShouldHaveSingleItem()
            .ShouldSatisfyAllConditions(
                e => e.PropertyName.ShouldBe("GroupName"),
                e => e.ErrorMessage.ShouldBe(message));
        Bulk.Validate(BulkOf(name, priority: 1, count: 1)).Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("GroupName");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1001)]
    public void Priority_outside_range_is_rejected(int priority)
    {
        Create.Validate(CreateOf("sre", priority)).Errors.ShouldHaveSingleItem()
            .ShouldSatisfyAllConditions(
                e => e.PropertyName.ShouldBe("Priority"),
                e => e.ErrorMessage.ShouldBe("Priority must be between 1 and 1000."));
        Bulk.Validate(BulkOf("sre", priority, count: 1)).Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("Priority");
        new UpdateGrantValidator().Validate(new UpdateGrantCommand(Guid.NewGuid(), AccessMode.ReadOnly, Guid.NewGuid(), 1, priority))
            .Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("Priority");
    }

    [Fact]
    public void Valid_commands_pass_and_update_accepts_no_priority()
    {
        Create.Validate(CreateOf("sre-emea", Grant.MaxPriority)).IsValid.ShouldBeTrue();
        Bulk.Validate(BulkOf("sre-emea", Grant.MinPriority, BulkGrantCommand.MaxItems)).IsValid.ShouldBeTrue();
        new UpdateGrantValidator().Validate(new UpdateGrantCommand(Guid.NewGuid(), AccessMode.ReadOnly, Guid.NewGuid(), 1))
            .IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Bulk_applies_the_user_bulk_item_rules()
    {
        Bulk.Validate(BulkOf("sre", 1, count: 0)).Errors.ShouldContain(e => e.ErrorMessage == BulkGrantValidator.ItemCountMessage);
        var duplicate = new BulkGroupGrantCommand("sre", AccessMode.ReadOnly, 1, [new("a", Guid.NewGuid()), new("a", Guid.NewGuid())]);
        Bulk.Validate(duplicate).Errors.ShouldHaveSingleItem()
            .ShouldSatisfyAllConditions(
                e => e.PropertyName.ShouldBe("Items[1].ClusterName"),
                e => e.ErrorMessage.ShouldBe(BulkGrantValidator.DuplicateClusterMessage));
    }

    private static CreateGroupGrantCommand CreateOf(string group, int priority) =>
        new(group, "prod-eu-1", Guid.NewGuid(), AccessMode.ReadOnly, priority);

    private static BulkGroupGrantCommand BulkOf(string group, int priority, int count) =>
        new(group, AccessMode.ReadOnly, priority, [.. Enumerable.Range(0, count).Select(i => new BulkGrantItem($"c-{i}", Guid.NewGuid()))]);
}
