namespace FleetConsole.Api.Endpoints.Admin;

// Request bodies of the credential endpoints (contract §8.4). Published in the OpenAPI document; the XML docs are
// written for API consumers. They carry the plaintext token, so they are never logged: the endpoint trims the token and
// wraps it in SensitiveString (redacted ToString) before anything else sees it.

/// <summary>Adds a ServiceAccount credential to a cluster. The token is write-only: it is never returned.</summary>
/// <param name="Name">The credential name, unique within the cluster: 1 to 63 characters, lowercase letters, digits and '-', starting and ending with a letter or digit.</param>
/// <param name="Description">Optional description, at most 1000 characters.</param>
/// <param name="Token">The ServiceAccount token. Surrounding whitespace is trimmed; then it must be non-empty, at most 16384 characters, printable ASCII without spaces or line breaks. JWT and opaque tokens are accepted.</param>
public sealed record AddCredentialRequest(string Name, string? Description, string Token);

/// <summary>Replaces a credential's token in place; the credential id and its grants are kept.</summary>
/// <param name="Token">The new ServiceAccount token, with the same rules as when adding a credential.</param>
/// <param name="Version">The credential's version from its last representation.</param>
public sealed record RotateCredentialTokenRequest(string Token, uint Version);
