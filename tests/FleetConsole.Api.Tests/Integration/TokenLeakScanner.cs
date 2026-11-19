using System.Text;
using Npgsql;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// Asserts that a secret (an OpenShift access token, an SA token) appears in none of the given texts: HTTP bodies,
/// decrypted cookie payloads, database dumps, captured logs (AUTH-3, CRED-2).
/// </summary>
/// <remarks>
/// Besides the whole value, it also looks for the part after a <c>sha256~</c> prefix and for the value with URL-style
/// percent-encoding, so a secret that was split off its prefix or escaped into a query string is still found. The
/// failure message names the haystack index, never the secret's surroundings.
/// </remarks>
internal static class TokenLeakScanner
{
    /// <summary>Fails when <paramref name="secret"/> occurs in any haystack.</summary>
    /// <param name="secret">The secret (at least 8 characters, so the check is meaningful).</param>
    /// <param name="haystacks">The texts to search.</param>
    public static void AssertAbsent(string secret, params string[] haystacks)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(secret);
        secret.Length.ShouldBeGreaterThanOrEqualTo(8, "a short secret would make the scan meaningless");
        haystacks.ShouldNotBeEmpty();

        var needles = new HashSet<string>(StringComparer.Ordinal) { secret, Uri.EscapeDataString(secret) };
        const string Sha256Prefix = "sha256~";
        if (secret.StartsWith(Sha256Prefix, StringComparison.Ordinal) && secret.Length - Sha256Prefix.Length >= 8)
        {
            needles.Add(secret[Sha256Prefix.Length..]);
        }

        for (var i = 0; i < haystacks.Length; i++)
        {
            foreach (var needle in needles)
            {
                haystacks[i].Contains(needle, StringComparison.Ordinal)
                    .ShouldBeFalse($"haystack #{i} contains the secret");
            }
        }
    }

    /// <summary>
    /// Every row of every table in the database's <c>public</c> schema as text (PostgreSQL's row-to-text cast), one row
    /// per line, prefixed with the table name: the "no DB table" haystack for <see cref="AssertAbsent"/>.
    /// </summary>
    /// <param name="connectionString">The database to dump.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The dump.</returns>
    public static async Task<string> DumpDatabaseAsync(string connectionString, CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        var tables = new List<string>();
        await using (var list = new NpgsqlCommand(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'", connection))
        await using (var reader = await list.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                tables.Add(reader.GetString(0));
            }
        }

        tables.ShouldNotBeEmpty();
        var dump = new StringBuilder();
        foreach (var table in tables)
        {
            // Table names come from the catalog, quoted as identifiers.
#pragma warning disable CA2100 // Review SQL queries for security vulnerabilities
            await using var select = new NpgsqlCommand($"SELECT t::text FROM \"{table.Replace("\"", "\"\"", StringComparison.Ordinal)}\" t", connection);
#pragma warning restore CA2100
            await using var reader = await select.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                dump.Append(table).Append(": ").AppendLine(reader.GetString(0));
            }
        }

        return dump.ToString();
    }
}
