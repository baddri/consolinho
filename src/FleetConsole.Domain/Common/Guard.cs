using System.Runtime.CompilerServices;

namespace FleetConsole.Domain.Common;

/// <summary>
/// Guard clauses for aggregate constructors and factory methods. They protect invariants against <em>programming
/// errors</em>: user input is validated earlier (FluentValidation in the Application layer, or a <see cref="Result"/>
/// returned by the aggregate), so a guard that fires indicates a bug and throws an <see cref="ArgumentException"/>.
/// </summary>
/// <remarks>
/// Each guard returns its (validated) argument so it can be used inline: <c>Name = Guard.NotNullOrWhiteSpace(name);</c>.
/// The parameter name is captured automatically via <see cref="CallerArgumentExpressionAttribute"/>.
/// </remarks>
public static class Guard
{
    /// <summary>Ensures a reference is not null.</summary>
    /// <typeparam name="T">The argument type.</typeparam>
    /// <param name="value">The argument.</param>
    /// <param name="paramName">Captured argument expression; do not pass explicitly.</param>
    /// <returns><paramref name="value"/>, typed as non-null.</returns>
    /// <exception cref="ArgumentNullException">When <paramref name="value"/> is null.</exception>
    public static T NotNull<T>(T? value, [CallerArgumentExpression(nameof(value))] string? paramName = null)
        where T : class
    {
        ArgumentNullException.ThrowIfNull(value, paramName);
        return value;
    }

    /// <summary>Ensures a string has visible content.</summary>
    /// <param name="value">The argument.</param>
    /// <param name="paramName">Captured argument expression; do not pass explicitly.</param>
    /// <returns><paramref name="value"/>, typed as non-null.</returns>
    /// <exception cref="ArgumentException">When <paramref name="value"/> is null, empty or whitespace.</exception>
    public static string NotNullOrWhiteSpace(string? value, [CallerArgumentExpression(nameof(value))] string? paramName = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value, paramName);
        return value;
    }

    /// <summary>Ensures a string does not exceed a maximum length (typically the column length of the persisted value).</summary>
    /// <param name="value">The argument.</param>
    /// <param name="maxLength">Inclusive maximum number of characters.</param>
    /// <param name="paramName">Captured argument expression; do not pass explicitly.</param>
    /// <returns><paramref name="value"/>.</returns>
    /// <exception cref="ArgumentNullException">When <paramref name="value"/> is null.</exception>
    /// <exception cref="ArgumentOutOfRangeException">When <paramref name="value"/> is longer than <paramref name="maxLength"/>.</exception>
    public static string MaxLength(string? value, int maxLength, [CallerArgumentExpression(nameof(value))] string? paramName = null)
    {
        ArgumentNullException.ThrowIfNull(value, paramName);
        if (value.Length > maxLength)
        {
            throw new ArgumentOutOfRangeException(paramName, value.Length, $"Must be at most {maxLength} characters long.");
        }

        return value;
    }

    /// <summary>Ensures a Guid identifier is not <see cref="Guid.Empty"/> (an id that was never assigned).</summary>
    /// <param name="value">The argument.</param>
    /// <param name="paramName">Captured argument expression; do not pass explicitly.</param>
    /// <returns><paramref name="value"/>.</returns>
    /// <exception cref="ArgumentException">When <paramref name="value"/> is <see cref="Guid.Empty"/>.</exception>
    public static Guid NotEmpty(Guid value, [CallerArgumentExpression(nameof(value))] string? paramName = null)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Must not be an empty Guid.", paramName);
        }

        return value;
    }

    /// <summary>Ensures a value type (e.g. a strongly typed id or a timestamp) is not its default value.</summary>
    /// <typeparam name="T">The value type.</typeparam>
    /// <param name="value">The argument.</param>
    /// <param name="paramName">Captured argument expression; do not pass explicitly.</param>
    /// <returns><paramref name="value"/>.</returns>
    /// <exception cref="ArgumentException">When <paramref name="value"/> equals <c>default(T)</c>.</exception>
    public static T NotDefault<T>(T value, [CallerArgumentExpression(nameof(value))] string? paramName = null)
        where T : struct
    {
        if (EqualityComparer<T>.Default.Equals(value, default))
        {
            throw new ArgumentException("Must not be the default value.", paramName);
        }

        return value;
    }

    /// <summary>Ensures a value lies within an inclusive range.</summary>
    /// <typeparam name="T">A comparable type.</typeparam>
    /// <param name="value">The argument.</param>
    /// <param name="min">Inclusive lower bound.</param>
    /// <param name="max">Inclusive upper bound.</param>
    /// <param name="paramName">Captured argument expression; do not pass explicitly.</param>
    /// <returns><paramref name="value"/>.</returns>
    /// <exception cref="ArgumentOutOfRangeException">When <paramref name="value"/> is outside [<paramref name="min"/>, <paramref name="max"/>].</exception>
    public static T InRange<T>(T value, T min, T max, [CallerArgumentExpression(nameof(value))] string? paramName = null)
        where T : IComparable<T>
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(value, min, paramName);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(value, max, paramName);
        return value;
    }
}
