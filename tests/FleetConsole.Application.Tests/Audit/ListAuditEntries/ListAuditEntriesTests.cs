using System.Buffers.Text;
using System.Text;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Audit.ListAuditEntries;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Tests.Audit.ListAuditEntries;

/// <summary>
/// The audit-log query (contract §10) over LINQ to Objects: filter semantics, keyset paging, cursor format and field
/// rules. SQL translation, index use and HTTP binding are covered by the Api integration tests.
/// </summary>
public sealed class ListAuditEntriesTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // ---- handler ---------------------------------------------------------------------------------------------------

    [Fact]
    public async Task ReturnsNewestFirst_WithEqualTimestampsOrderedByIdDescending()
    {
        var model = new AuditReadModel();
        var older = model.Add(T0, "alice", "user.created", "bob");
        var a = model.Add(T0.AddMinutes(1), "alice", "user.created", "carol");
        var b = model.Add(T0.AddMinutes(1), "alice", "user.created", "dave");

        var page = await Handle(model, new ListAuditEntriesQuery());

        var expectedTies = new[] { a, b }.OrderByDescending(e => e.Id).Select(e => e.Id.Value);
        page.Items.Select(i => i.Id).ShouldBe([.. expectedTies, older.Id.Value]);
        page.NextCursor.ShouldBeNull();
    }

    [Fact]
    public async Task Pages_WithoutDuplicatesOrGaps_AndNullCursorOnLastPage()
    {
        var model = new AuditReadModel();
        for (var i = 0; i < 7; i++)
        {
            // Pairs share a timestamp, so the id tiebreaker is exercised at page boundaries.
            model.Add(T0.AddSeconds(i / 2), "alice", "auth.login", $"s{i}");
        }

        var seen = new List<Guid>();
        string? cursor = null;
        var pages = 0;
        do
        {
            var page = await Handle(model, new ListAuditEntriesQuery(Cursor: cursor, Limit: 3));
            seen.AddRange(page.Items.Select(i => i.Id));
            cursor = page.NextCursor;
            pages++;
        }
        while (cursor is not null);

        pages.ShouldBe(3);
        seen.ShouldBe(model.Rows.OrderByDescending(e => e.OccurredAt).ThenByDescending(e => e.Id).Select(e => e.Id.Value));
    }

    [Fact]
    public async Task ExactlyLimitRows_HasNoNextCursor()
    {
        var model = new AuditReadModel();
        model.Add(T0, "alice", "auth.login", "s1");
        model.Add(T0.AddSeconds(1), "alice", "auth.login", "s2");

        var page = await Handle(model, new ListAuditEntriesQuery(Limit: 2));

        page.Items.Count.ShouldBe(2);
        page.NextCursor.ShouldBeNull();
    }

    [Fact]
    public async Task UserFilter_MatchesActorOrRelatedUser()
    {
        var model = new AuditReadModel();
        var asActor = model.Add(T0, "erin", "auth.login", "session");
        var asTarget = model.Add(T0.AddSeconds(1), "admin", "user.deactivated", "erin", related: "erin");
        var asGrantUser = model.Add(T0.AddSeconds(2), "admin", "grant.created", "erin → prod", cluster: "prod", related: "erin");
        model.Add(T0.AddSeconds(3), "admin", "user.created", "frank", related: "frank");

        var page = await Handle(model, new ListAuditEntriesQuery(User: "erin"));

        page.Items.Select(i => i.Id).ShouldBe([asGrantUser.Id.Value, asTarget.Id.Value, asActor.Id.Value]);
    }

    [Fact]
    public async Task Filters_CombineWithAnd_TimeRangeIsHalfOpen_TargetIsCaseInsensitiveSubstring()
    {
        var model = new AuditReadModel();
        var match = model.Add(T0, "alice", "cluster.updated", "Prod-EU-1", cluster: "Prod-EU-1");
        model.Add(T0.AddHours(1), "alice", "cluster.updated", "prod-eu-1", cluster: "prod-eu-1"); // at 'to': excluded
        model.Add(T0, "bob", "cluster.updated", "prod-eu-1", cluster: "prod-eu-1");               // other actor
        model.Add(T0, "alice", "credential.added", "prod-eu-1-sa", cluster: "prod-eu-1");          // other category

        var page = await Handle(model, new ListAuditEntriesQuery(
            Actor: "alice", Category: "Clusters", Target: "eu-1", From: T0, To: T0.AddHours(1)));

        page.Items.ShouldHaveSingleItem().Id.ShouldBe(match.Id.Value);
    }

    [Fact]
    public async Task Details_AreParsedJsonObjects()
    {
        var model = new AuditReadModel();
        model.Add(T0, "alice", "user.read_only_changed", "bob", details: """{"isReadOnly":true}""");

        var item = (await Handle(model, new ListAuditEntriesQuery())).Items.ShouldHaveSingleItem();

        item.Details.ShouldNotBeNull();
        item.Details.Value.GetProperty("isReadOnly").GetBoolean().ShouldBeTrue();
        item.Category.ShouldBe(AuditCategory.Users);
    }

    // ---- cursor ----------------------------------------------------------------------------------------------------

    [Fact]
    public void Cursor_RoundTrips_AndIsUrlSafe()
    {
        var cursor = new AuditCursor(T0.AddTicks(1234560), AuditEntryId.New());

        var encoded = cursor.Encode();

        encoded.ShouldNotContain('+');
        encoded.ShouldNotContain('/');
        encoded.ShouldNotContain('=');
        AuditCursor.TryParse(encoded, out var parsed).ShouldBeTrue();
        parsed.ShouldBe(cursor);
    }

    [Fact]
    public void Cursor_WithNonUtcOffset_IsNormalizedToUtc()
    {
        var id = Guid.NewGuid();
        var local = T0.ToOffset(TimeSpan.FromHours(-7));
        var value = Base64Url.EncodeToString(Encoding.UTF8.GetBytes(
            $"{local.ToString("O", System.Globalization.CultureInfo.InvariantCulture)}|{id:D}"));

        AuditCursor.TryParse(value, out var parsed).ShouldBeTrue();

        parsed.OccurredAt.Offset.ShouldBe(TimeSpan.Zero);
        parsed.OccurredAt.ShouldBe(T0);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not base64 !")]
    [InlineData("bm90LWEtY3Vyc29y")] // "not-a-cursor"
    public void Cursor_RejectsForeignValues(string value) => AuditCursor.TryParse(value, out _).ShouldBeFalse();

    [Fact]
    public void Cursor_RejectsBadTimestampOrId()
    {
        static string Encode(string text) => Base64Url.EncodeToString(Encoding.UTF8.GetBytes(text));

        AuditCursor.TryParse(Encode($"yesterday|{Guid.NewGuid()}"), out _).ShouldBeFalse();
        AuditCursor.TryParse(Encode($"{T0:O}|not-a-guid"), out _).ShouldBeFalse();
        AuditCursor.TryParse(Encode($"{T0:O}|{Guid.Empty}"), out _).ShouldBeFalse();
        AuditCursor.TryParse(new string('A', 300), out _).ShouldBeFalse();
    }

    // ---- validator -------------------------------------------------------------------------------------------------

    [Theory]
    [InlineData(1)]
    [InlineData(200)]
    public void Validator_AcceptsLimitInRange(int limit) =>
        new ListAuditEntriesValidator().Validate(new ListAuditEntriesQuery(Limit: limit)).IsValid.ShouldBeTrue();

    [Theory]
    [InlineData(0, "Limit")]
    [InlineData(201, "Limit")]
    public void Validator_RejectsLimitOutOfRange(int limit, string property) =>
        new ListAuditEntriesValidator().Validate(new ListAuditEntriesQuery(Limit: limit))
            .Errors.ShouldHaveSingleItem().PropertyName.ShouldBe(property);

    [Theory]
    [InlineData("users", true)]
    [InlineData("Credentials", true)]
    [InlineData("user", false)]
    [InlineData("2", false)]
    [InlineData("", false)]
    public void Validator_Category_ByNameOnly(string category, bool valid)
    {
        var result = new ListAuditEntriesValidator().Validate(new ListAuditEntriesQuery(Category: category));

        result.IsValid.ShouldBe(valid);
        if (!valid)
        {
            result.Errors.ShouldHaveSingleItem().PropertyName.ShouldBe(nameof(ListAuditEntriesQuery.Category));
        }
    }

    [Fact]
    public void Validator_RejectsBadCursor_OnCursorField() =>
        new ListAuditEntriesValidator().Validate(new ListAuditEntriesQuery(Cursor: "garbage"))
            .Errors.ShouldHaveSingleItem().PropertyName.ShouldBe(nameof(ListAuditEntriesQuery.Cursor));

    [Fact]
    public void Validator_RequiresFromBeforeTo()
    {
        var validator = new ListAuditEntriesValidator();

        validator.Validate(new ListAuditEntriesQuery(From: T0, To: T0))
            .Errors.ShouldHaveSingleItem().PropertyName.ShouldBe(nameof(ListAuditEntriesQuery.To));
        validator.Validate(new ListAuditEntriesQuery(From: T0, To: T0.AddSeconds(1))).IsValid.ShouldBeTrue();
        validator.Validate(new ListAuditEntriesQuery(From: T0)).IsValid.ShouldBeTrue();
    }

    private static async Task<AuditPageDto> Handle(IReadModel model, ListAuditEntriesQuery query)
    {
        var result = await new ListAuditEntriesHandler(model).Handle(query, Ct);
        result.IsSuccess.ShouldBeTrue();
        return result.Value;
    }

    /// <summary><see cref="IReadModel"/> with an in-memory audit log, executed with LINQ to Objects.</summary>
    private sealed class AuditReadModel : IReadModel
    {
        public List<AuditEntry> Rows { get; } = [];

        public IQueryable<User> Users => Enumerable.Empty<User>().AsQueryable();

        public IQueryable<Cluster> Clusters => Enumerable.Empty<Cluster>().AsQueryable();

        public IQueryable<Credential> Credentials => Enumerable.Empty<Credential>().AsQueryable();

        public IQueryable<Grant> Grants => Enumerable.Empty<Grant>().AsQueryable();

        public IQueryable<AuditEntry> AuditEntries => Rows.AsQueryable();

        public AuditEntry Add(
            DateTimeOffset at, string actor, string action, string target, string? cluster = null, string? related = null, string details = "{}")
        {
            var entry = AuditEntry.Record(
                new AuditActor(null, actor, IsSystem: false),
                action,
                AuditTargetType.User,
                targetId: null,
                target,
                cluster,
                $"{actor} did {action} on {target}.",
                correlationId: null,
                details,
                at,
                related);
            Rows.Add(entry);
            return entry;
        }

        public Task<List<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.ToList());

        public Task<T?> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.FirstOrDefault());

        public Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Count());

        public Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Any());
    }
}
