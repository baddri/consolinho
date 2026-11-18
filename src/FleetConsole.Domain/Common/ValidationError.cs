namespace FleetConsole.Domain.Common;

/// <summary>
/// A <see cref="ErrorType.Validation"/> error that carries messages per input field. Produced by the Application
/// layer's <c>ValidationBehavior</c> from FluentValidation results and rendered by the Api as the <c>errors</c> member of
/// a 400 ProblemDetails response, so the UI can show each message next to its form field.
/// </summary>
public sealed record ValidationError : Error
{
    /// <summary>The fixed error code for field-level validation failures.</summary>
    public const string ValidationFailedCode = "Validation.Failed";

    /// <summary>Creates a validation error from per-field messages.</summary>
    /// <param name="errors">Messages keyed by field name. Must contain at least one entry.</param>
    /// <exception cref="ArgumentException">When <paramref name="errors"/> is empty (a validation failure without
    /// any reason is a bug in the caller).</exception>
    public ValidationError(IReadOnlyDictionary<string, string[]> errors)
        : base(ValidationFailedCode, "One or more validation errors occurred.", ErrorType.Validation)
    {
        ArgumentNullException.ThrowIfNull(errors);
        if (errors.Count == 0)
        {
            throw new ArgumentException("A validation error needs at least one field error.", nameof(errors));
        }

        Errors = errors;
    }

    /// <summary>
    /// Messages keyed by field name as the validator reported it (C# property path, e.g. <c>"Name"</c> or
    /// <c>"Endpoints[0].Url"</c>). The Api converts keys to the JSON naming policy; an empty key means "whole request".
    /// </summary>
    public IReadOnlyDictionary<string, string[]> Errors { get; }
}
