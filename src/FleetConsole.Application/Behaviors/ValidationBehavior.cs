using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Common;
using FluentValidation;

namespace FleetConsole.Application.Behaviors;

/// <summary>
/// Runs every FluentValidation validator registered for the request before the handler. If any rule fails, the
/// handler is skipped and a failed result carrying a <see cref="ValidationError"/> (messages grouped by field) is
/// returned, which the Api renders as a 400 ProblemDetails with an <c>errors</c> dictionary. Never throws for invalid
/// input.
/// </summary>
/// <remarks>
/// <para>Validators are discovered by <c>AddApplication()</c>; a use case adds one by creating
/// <c>&lt;UseCase&gt;Validator : AbstractValidator&lt;TRequest&gt;</c> in its folder. Requests without validators pass straight through.</para>
/// <para>Only failures with <see cref="Severity.Error"/> block the request; warnings/infos are ignored.</para>
/// <para>Validated requests must return <see cref="Result"/>/<see cref="Result{TValue}"/>; a validator on any other
/// request type is a wiring bug and fails fast with <see cref="InvalidOperationException"/>, even for valid input.</para>
/// </remarks>
/// <typeparam name="TRequest">The request type.</typeparam>
/// <typeparam name="TResponse">The response type.</typeparam>
/// <param name="validators">All validators registered for <typeparamref name="TRequest"/>.</param>
internal sealed class ValidationBehavior<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly IValidator<TRequest>[] _validators = validators.ToArray();

    /// <inheritdoc />
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(next);

        if (_validators.Length == 0)
        {
            return await next(cancellationToken).ConfigureAwait(false);
        }

        if (!FailureResult<TResponse>.IsSupported)
        {
            throw new InvalidOperationException(
                $"'{typeof(TRequest).FullName}' has validators but its response type '{typeof(TResponse).FullName}' " +
                "cannot carry a validation error. Make the request an ICommand or IQuery.");
        }

        var fieldErrors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var validator in _validators)
        {
            // One call per validator with a fresh context: a shared ValidationContext accumulates failures across calls.
            var result = await validator.ValidateAsync(request, cancellationToken).ConfigureAwait(false);
            foreach (var failure in result.Errors.Where(f => f.Severity == Severity.Error))
            {
                if (!fieldErrors.TryGetValue(failure.PropertyName, out var messages))
                {
                    messages = [];
                    fieldErrors[failure.PropertyName] = messages;
                }

                if (!messages.Contains(failure.ErrorMessage, StringComparer.Ordinal))
                {
                    messages.Add(failure.ErrorMessage);
                }
            }
        }

        if (fieldErrors.Count == 0)
        {
            return await next(cancellationToken).ConfigureAwait(false);
        }

        var errors = fieldErrors.ToDictionary(pair => pair.Key, pair => pair.Value.ToArray(), StringComparer.Ordinal);
        return FailureResult<TResponse>.Create(Error.Validation(errors));
    }
}
