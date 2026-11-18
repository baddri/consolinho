using System.Diagnostics.CodeAnalysis;

namespace FleetConsole.Domain.Common;

/// <summary>
/// Outcome of an operation that can fail in an expected way: either success, or failure with an <see cref="Common.Error"/>.
/// Every command returns <see cref="Result"/> or <see cref="Result{TValue}"/>, and aggregates can return it from
/// behaviour methods, which is why it lives in the Domain.
/// </summary>
/// <remarks>
/// <para>Create instances with <see cref="Success()"/> / <see cref="Failure(Common.Error)"/>, or implicitly from an
/// <see cref="Common.Error"/> (<c>return Error.NotFound(...);</c>). The type is immutable.</para>
/// <para><see cref="IsFailure"/> and <see cref="IsSuccess"/> are annotated so the compiler knows <see cref="Error"/> is
/// non-null after checking them.</para>
/// </remarks>
public class Result
{
    private static readonly Result SuccessInstance = new(isSuccess: true, error: null);

    /// <summary>Creates a result; derived types use this to add a value. Enforces "success ⇔ no error".</summary>
    /// <param name="isSuccess">Whether the operation succeeded.</param>
    /// <param name="error">The failure reason; must be <see langword="null"/> exactly when <paramref name="isSuccess"/> is true.</param>
    /// <exception cref="ArgumentException">When success and error are inconsistent.</exception>
    protected Result(bool isSuccess, Error? error)
    {
        if (isSuccess && error is not null)
        {
            throw new ArgumentException("A successful result cannot carry an error.", nameof(error));
        }

        if (!isSuccess && error is null)
        {
            throw new ArgumentException("A failed result must carry an error.", nameof(error));
        }

        IsSuccess = isSuccess;
        Error = error;
    }

    /// <summary>True when the operation succeeded; <see cref="Error"/> is then <see langword="null"/>.</summary>
    [MemberNotNullWhen(false, nameof(Error))]
    public bool IsSuccess { get; }

    /// <summary>True when the operation failed; <see cref="Error"/> is then set.</summary>
    [MemberNotNullWhen(true, nameof(Error))]
    public bool IsFailure => !IsSuccess;

    /// <summary>The failure reason, or <see langword="null"/> on success.</summary>
    public Error? Error { get; }

    /// <summary>Returns the (shared, immutable) successful result.</summary>
    /// <returns>A successful <see cref="Result"/>.</returns>
    public static Result Success() => SuccessInstance;

    /// <summary>Creates a failed result.</summary>
    /// <param name="error">The failure reason.</param>
    /// <returns>A failed <see cref="Result"/>.</returns>
    public static Result Failure(Error error)
    {
        ArgumentNullException.ThrowIfNull(error);
        return new Result(isSuccess: false, error);
    }

    /// <summary>Creates a successful result carrying <paramref name="value"/>.</summary>
    /// <typeparam name="TValue">The value type.</typeparam>
    /// <param name="value">The operation's output.</param>
    /// <returns>A successful <see cref="Result{TValue}"/>.</returns>
    public static Result<TValue> Success<TValue>(TValue value) => new(value);

    /// <summary>Creates a failed result for an operation that would have produced a <typeparamref name="TValue"/>.</summary>
    /// <typeparam name="TValue">The value type the operation would have produced.</typeparam>
    /// <param name="error">The failure reason.</param>
    /// <returns>A failed <see cref="Result{TValue}"/>.</returns>
    public static Result<TValue> Failure<TValue>(Error error)
    {
        ArgumentNullException.ThrowIfNull(error);
        return new Result<TValue>(error);
    }

    /// <summary>Lets handlers write <c>return Error.NotFound(...);</c> for a <see cref="Result"/> return type.</summary>
    /// <param name="error">The failure reason.</param>
    public static implicit operator Result(Error error) => Failure(error);
}

/// <summary>
/// A <see cref="Result"/> that carries a value on success. Returned by queries and by commands that produce
/// something (e.g. the id of a created aggregate).
/// </summary>
/// <remarks>
/// C# does not allow user-defined conversions from interface types, so <c>return dto;</c> does not compile when
/// <typeparamref name="TValue"/> is an interface (e.g. <c>IReadOnlyList&lt;ClusterSummaryDto&gt;</c>); write
/// <c>return Result.Success(list);</c> there.
/// </remarks>
/// <typeparam name="TValue">The type of the value produced on success.</typeparam>
public sealed class Result<TValue> : Result
{
    private readonly TValue _value;

    internal Result(TValue value)
        : base(isSuccess: true, error: null) => _value = value;

    internal Result(Error error)
        : base(isSuccess: false, error) => _value = default!;

    /// <summary>The value produced by a successful operation.</summary>
    /// <exception cref="InvalidOperationException">When read on a failed result: that is a bug in the caller, which
    /// must check <see cref="Result.IsSuccess"/> first.</exception>
    public TValue Value => IsSuccess
        ? _value
        : throw new InvalidOperationException($"Cannot read the value of a failed result (error '{Error.Code}').");

    /// <summary>Lets handlers write <c>return dto;</c> for a <see cref="Result{TValue}"/> return type.</summary>
    /// <param name="value">The value to wrap in a successful result.</param>
    public static implicit operator Result<TValue>(TValue value) => new(value);

    /// <summary>Lets handlers write <c>return Error.NotFound(...);</c> for a <see cref="Result{TValue}"/> return type.</summary>
    /// <param name="error">The failure reason.</param>
    public static implicit operator Result<TValue>(Error error) => Failure<TValue>(error);
}
