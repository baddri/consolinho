namespace FleetConsole.DevOAuth;

/// <summary>
/// Marker type identifying the DevOAuth emulator's assembly, so tests can host it with
/// <c>WebApplicationFactory&lt;DevOAuthEntryPoint&gt;</c>.
/// </summary>
/// <remarks>
/// The emulator's own <c>Program</c> is declared <c>internal</c> in <c>Program.cs</c>. The Api exposes
/// <c>public partial class Program</c> for its tests, and the Api test project references both applications, so a
/// second public global <c>Program</c> would make that name ambiguous there. For the same reason this project must not
/// grant <c>InternalsVisibleTo</c> to the test project.
/// </remarks>
public sealed class DevOAuthEntryPoint;
