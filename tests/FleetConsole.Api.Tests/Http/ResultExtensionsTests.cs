using System.Reflection;
using FleetConsole.Api.Http;
using FleetConsole.Domain.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;

namespace FleetConsole.Api.Tests.Http;

public sealed class ResultExtensionsTests
{
    public static TheoryData<ErrorType, int> StatusByErrorType => new()
    {
        { ErrorType.Validation, StatusCodes.Status400BadRequest },
        { ErrorType.Unauthorized, StatusCodes.Status401Unauthorized },
        { ErrorType.Forbidden, StatusCodes.Status403Forbidden },
        { ErrorType.NotFound, StatusCodes.Status404NotFound },
        { ErrorType.Conflict, StatusCodes.Status409Conflict },
        { ErrorType.Failure, StatusCodes.Status500InternalServerError },
    };

    [Theory]
    [MemberData(nameof(StatusByErrorType))]
    public async Task Failure_IsWrittenAsProblemDetails_WithMappedStatus(ErrorType type, int expectedStatus)
    {
        Result result = new Error("Things.Problem", "Something about the thing.", type);

        var (status, contentType, body) = await HttpResultExecutor.ExecuteAsync(result.ToHttpResult());

        status.ShouldBe(expectedStatus);
        contentType.ShouldBe("application/problem+json");
        var json = body.ShouldNotBeNull();
        json.GetProperty("status").GetInt32().ShouldBe(expectedStatus);
        json.GetProperty("type").GetString().ShouldNotBeNullOrEmpty();
        json.GetProperty("title").GetString().ShouldNotBeNullOrEmpty();
        json.GetProperty("detail").GetString().ShouldBe("Something about the thing.");
        json.GetProperty("code").GetString().ShouldBe("Things.Problem");
        json.GetProperty("instance").GetString().ShouldBe("/api/things/42");
        json.GetProperty("traceId").GetString().ShouldNotBeNullOrEmpty();
    }

    [Fact]
    public async Task ValidationError_IncludesCamelCasedErrorsDictionary()
    {
        var error = Error.Validation(new Dictionary<string, string[]>
        {
            ["Name"] = ["Name is required."],
            ["Endpoints[0].Url"] = ["Must be https.", "Must be absolute."],
        });
        Result<int> result = error;

        var (status, _, body) = await HttpResultExecutor.ExecuteAsync(result.ToHttpResult());

        status.ShouldBe(StatusCodes.Status400BadRequest);
        var json = body.ShouldNotBeNull();
        json.GetProperty("code").GetString().ShouldBe(ValidationError.ValidationFailedCode);
        var errors = json.GetProperty("errors");
        errors.GetProperty("name").EnumerateArray().Select(e => e.GetString()).ShouldBe(["Name is required."]);
        errors.GetProperty("endpoints[0].url").EnumerateArray().Select(e => e.GetString()).ShouldBe(["Must be https.", "Must be absolute."]);
    }

    [Fact]
    public async Task SuccessWithoutValue_Is204()
    {
        var (status, _, body) = await HttpResultExecutor.ExecuteAsync(Result.Success().ToHttpResult());

        status.ShouldBe(StatusCodes.Status204NoContent);
        body.ShouldBeNull();
    }

    [Fact]
    public async Task SuccessWithValue_Is200WithJsonBody()
    {
        Result<Sample> result = new Sample("alpha", 3);

        var (status, _, body) = await HttpResultExecutor.ExecuteAsync(result.ToHttpResult());

        status.ShouldBe(StatusCodes.Status200OK);
        var json = body.ShouldNotBeNull();
        json.GetProperty("name").GetString().ShouldBe("alpha");
        json.GetProperty("count").GetInt32().ShouldBe(3);
    }

    [Fact]
    public void SuccessWithoutValue_ProducesTypedNoContent()
    {
        Result.Success().ToHttpResult().Result.ShouldBeOfType<NoContent>();
    }

    [Fact]
    public void SuccessWithValue_ProducesTypedOk()
    {
        Result<Sample> result = new Sample("alpha", 3);

        result.ToHttpResult().Result.ShouldBeOfType<Ok<Sample>>().Value.ShouldBe(new Sample("alpha", 3));
    }

    [Fact]
    public void Failure_ProducesTypedProblem()
    {
        Result<Sample> result = Error.NotFound("Things.NotFound", "Nope.");

        result.ToHttpResult().Result.ShouldBeOfType<ProblemHttpResult>().StatusCode.ShouldBe(StatusCodes.Status404NotFound);
    }

    [Fact]
    public void SuccessWithCustomMapping_UsesCallback()
    {
        Result<int> result = 7;

        var httpResult = result.ToHttpResult(id => TypedResults.Created($"/api/things/{id}", id));

        httpResult.Result.ShouldBeOfType<Created<int>>().Location.ShouldBe("/api/things/7");
    }

    [Fact]
    public void FailureWithCustomMapping_StillReturnsProblem()
    {
        Result<int> result = Error.Conflict("Things.Duplicate", "Exists.");

        var httpResult = result.ToHttpResult<int, Created<int>>(_ => throw new InvalidOperationException("must not be called"));

        httpResult.Result.ShouldBeOfType<ProblemHttpResult>().StatusCode.ShouldBe(StatusCodes.Status409Conflict);
    }

    [Fact]
    public void TypedUnion_PopulatesEndpointResponseMetadata_ForOpenApi()
    {
        // What minimal APIs do for an endpoint whose handler returns this type: the metadata feeds /openapi/v1.json.
        var builder = new RouteEndpointBuilder(_ => Task.CompletedTask, RoutePatternFactory.Parse("/"), order: 0);

        PopulateMetadata<Results<Ok<Sample>, ProblemHttpResult>>(builder);

        var produces = builder.Metadata.OfType<IProducesResponseTypeMetadata>().ToArray();
        produces.ShouldContain(m => m.StatusCode == StatusCodes.Status200OK && m.Type == typeof(Sample));
        // ProblemHttpResult's status varies per instance, so the framework emits no produces-metadata for it (error
        // responses get documented once at the /api group level, T-0004). It does opt the endpoint out of cookie-auth
        // login redirects, so API callers get a real 401/403.
        produces.ShouldHaveSingleItem().ContentTypes.ShouldBe(["application/json"]);
        builder.Metadata.OfType<IDisableCookieRedirectMetadata>().ShouldNotBeEmpty();
    }

    private static void PopulateMetadata<TResult>(EndpointBuilder builder)
        where TResult : IEndpointMetadataProvider =>
        TResult.PopulateMetadata(typeof(ResultExtensionsTests).GetMethod(nameof(PopulateMetadata), BindingFlags.NonPublic | BindingFlags.Static)!, builder);

    [Fact]
    public void ToProblemDetails_OnSuccess_Throws()
    {
        Should.Throw<InvalidOperationException>(() => Result.Success().ToProblemDetails());
    }

    [Fact]
    public void UnknownErrorType_MapsTo500()
    {
        ((ErrorType)999).ToStatusCode().ShouldBe(StatusCodes.Status500InternalServerError);
    }

    public sealed record Sample(string Name, int Count);
}
