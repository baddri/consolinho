using System.Diagnostics.CodeAnalysis;

namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// The outcome of one probe call: either a parsed <see cref="Value"/> or a categorized <see cref="Failure"/>, never both.
/// Expected failures (network, TLS, HTTP status) are data, not exceptions, because the connection test reports them to
/// the admin step by step. Only caller cancellation and bugs throw.
/// </summary>
/// <typeparam name="T">The parsed response type.</typeparam>
public sealed record ProbeResponse<T>
{
    private ProbeResponse(T? value, ProbeFailure? failure)
    {
        Value = value;
        Failure = failure;
    }

    /// <summary>The parsed response; set exactly when <see cref="IsSuccess"/> is true.</summary>
    public T? Value { get; }

    /// <summary>Why the call failed; set exactly when <see cref="IsSuccess"/> is false.</summary>
    public ProbeFailure? Failure { get; }

    /// <summary>True when the call succeeded and <see cref="Value"/> holds the parsed response.</summary>
    [MemberNotNullWhen(true, nameof(Value))]
    [MemberNotNullWhen(false, nameof(Failure))]
    public bool IsSuccess => Failure is null;

    /// <summary>Creates a successful response.</summary>
    /// <param name="value">The parsed response.</param>
    /// <returns>A response whose <see cref="Value"/> is <paramref name="value"/>.</returns>
#pragma warning disable CA1000 // Static factory on the generic type is the contract (ADR-0011); call sites read ProbeResponse<T>.Ok(...).
    public static ProbeResponse<T> Ok(T value)
    {
        ArgumentNullException.ThrowIfNull(value);
        return new(value, null);
    }

    /// <summary>Creates a failed response.</summary>
    /// <param name="failure">The categorized failure.</param>
    /// <returns>A response whose <see cref="Failure"/> is <paramref name="failure"/>.</returns>
    public static ProbeResponse<T> Fail(ProbeFailure failure)
    {
        ArgumentNullException.ThrowIfNull(failure);
        return new(default, failure);
    }
#pragma warning restore CA1000
}
