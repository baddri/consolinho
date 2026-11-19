using FleetConsole.Application.Grants.BulkGrant;
using FleetConsole.Application.Grants.CreateGrant;
using FleetConsole.Application.Grants.UpdateGrant;
using FleetConsole.Domain.Access;

namespace FleetConsole.Application.Tests.Grants;

/// <summary>Shape rules of the grant commands (contract §9.3/§9.4): item count, unique clusters, access mode.</summary>
public sealed class GrantValidatorTests
{
    private static readonly BulkGrantValidator Bulk = new();

    [Fact]
    public void Bulk_accepts_1_to_100_unique_items()
    {
        Bulk.Validate(BulkOf(1)).IsValid.ShouldBeTrue();
        Bulk.Validate(BulkOf(BulkGrantCommand.MaxItems)).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(BulkGrantCommand.MaxItems + 1)]
    public void Bulk_rejects_item_count_outside_range(int count)
    {
        var result = Bulk.Validate(BulkOf(count));

        result.Errors.ShouldContain(e => e.PropertyName == "Items" && e.ErrorMessage == BulkGrantValidator.ItemCountMessage);
    }

    [Fact]
    public void Bulk_marks_every_later_duplicate_cluster()
    {
        var result = Bulk.Validate(new BulkGrantCommand(
            "alice", AccessMode.ReadOnly, [Item("a"), Item("b"), Item("a"), Item("a")]));

        result.Errors.Where(e => e.ErrorMessage == BulkGrantValidator.DuplicateClusterMessage)
            .Select(e => e.PropertyName)
            .ShouldBe(["Items[2].ClusterName", "Items[3].ClusterName"]);
    }

    [Fact]
    public void Bulk_requires_cluster_name_and_items()
    {
        Bulk.Validate(new BulkGrantCommand("alice", AccessMode.ReadOnly, [Item("")]))
            .Errors.ShouldContain(e => e.PropertyName == "Items[0].ClusterName");
        Bulk.Validate(new BulkGrantCommand("alice", AccessMode.ReadOnly, null!))
            .Errors.ShouldContain(e => e.PropertyName == "Items");
    }

    [Fact]
    public void Undefined_access_mode_is_rejected_everywhere()
    {
        const AccessMode bogus = (AccessMode)7;

        Bulk.Validate(new BulkGrantCommand("alice", bogus, [Item("a")])).Errors.ShouldContain(e => e.PropertyName == "AccessMode");
        new CreateGrantValidator().Validate(new CreateGrantCommand("alice", "a", Guid.NewGuid(), bogus))
            .Errors.ShouldContain(e => e.PropertyName == "AccessMode");
        new UpdateGrantValidator().Validate(new UpdateGrantCommand(Guid.NewGuid(), bogus, Guid.NewGuid(), 1))
            .Errors.ShouldContain(e => e.PropertyName == "AccessMode");
    }

    [Fact]
    public void Create_requires_username_and_cluster()
    {
        var result = new CreateGrantValidator().Validate(new CreateGrantCommand("", "", Guid.NewGuid(), AccessMode.ReadOnly));

        result.Errors.Select(e => e.PropertyName).ShouldBe(["Username", "ClusterName"], ignoreOrder: true);
    }

    private static BulkGrantItem Item(string cluster) => new(cluster, Guid.NewGuid());

    private static BulkGrantCommand BulkOf(int count) =>
        new("alice", AccessMode.ReadOnly, [.. Enumerable.Range(0, count).Select(i => Item($"c-{i}"))]);
}
