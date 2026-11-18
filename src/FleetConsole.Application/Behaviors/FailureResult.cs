using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Behaviors;

/// <summary>
/// Creates a failed <typeparamref name="TResponse"/> from an <see cref="Error"/> inside open-generic behaviors, where
/// the compiler only knows <typeparamref name="TResponse"/> as a type parameter. Supports <see cref="Result"/> and
/// <see cref="Result{TValue}"/> — the only response types use cases declare.
/// </summary>
/// <remarks>
/// The factory is built once per closed type (static readonly field of a generic class), so the reflection cost is
/// paid once per response type, not per request.
/// </remarks>
/// <typeparam name="TResponse">The response type of the request being processed.</typeparam>
internal static class FailureResult<TResponse>
{
    private static readonly Func<Error, TResponse>? Factory = CreateFactory();

    /// <summary>Whether <typeparamref name="TResponse"/> can represent a failure, i.e. is a <see cref="Result"/> type.</summary>
    public static bool IsSupported => Factory is not null;

    /// <summary>Wraps <paramref name="error"/> in a failed <typeparamref name="TResponse"/>.</summary>
    /// <param name="error">The failure reason.</param>
    /// <returns>A failed result.</returns>
    /// <exception cref="InvalidOperationException">When <typeparamref name="TResponse"/> is not a <see cref="Result"/> type.</exception>
    public static TResponse Create(Error error) =>
        Factory is not null
            ? Factory(error)
            : throw new InvalidOperationException(
                $"'{typeof(TResponse).FullName}' cannot carry an Error. Requests that can fail must return Result or Result<T>.");

    private static Func<Error, TResponse>? CreateFactory()
    {
        var type = typeof(TResponse);

        if (type == typeof(Result))
        {
            return error => (TResponse)(object)Result.Failure(error);
        }

        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(Result<>))
        {
            // Result.Failure<TValue>(Error) closed over Result<TValue>'s value type.
            var failure = typeof(Result)
                .GetMethod(nameof(Result.Failure), genericParameterCount: 1, [typeof(Error)])!
                .MakeGenericMethod(type.GetGenericArguments()[0]);
            return failure.CreateDelegate<Func<Error, TResponse>>();
        }

        return null;
    }
}
