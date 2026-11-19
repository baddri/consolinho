using System.Security.Cryptography;
using System.Text;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Credentials;
using FleetConsole.Infrastructure.Crypto;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using static FleetConsole.Api.Tests.Persistence.PersistenceTestData;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// CRED-2, storage part (ADR-0004): SA tokens are encrypted with Data Protection, whose keys live in PostgreSQL, and
/// the <c>credentials.token</c> column never holds the plaintext.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class TokenProtectionTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task StoredToken_IsCiphertext_AndUnprotectsAfterReload()
    {
        var token = FakeToken();
        var cluster = NewCluster();
        Credential credential = null!;
        await using (var scope = factory.Services.CreateSignedInScope())
        {
            var sp = scope.ServiceProvider;
            sp.GetRequiredService<IClusterRepository>().Add(cluster);
            credential = NewCredential(cluster, sp.GetRequiredService<ITokenProtector>(), token);
            sp.GetRequiredService<ICredentialRepository>().Add(credential);
            await sp.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        }

        var stored = await TokenColumnAsync(credential.Id);
        stored.Length.ShouldBeGreaterThan(Encoding.UTF8.GetByteCount(token));
        Contains(stored, Encoding.UTF8.GetBytes(token)).ShouldBeFalse();
        Contains(stored, Encoding.UTF8.GetBytes(token[..16])).ShouldBeFalse("not even a prefix of the token may be stored");
        Contains(stored, Encoding.Unicode.GetBytes(token[..16])).ShouldBeFalse();

        await using (var scope = factory.Services.CreateSignedInScope())
        {
            var sp = scope.ServiceProvider;
            var loaded = (await sp.GetRequiredService<ICredentialRepository>().GetByIdAsync(credential.Id, Ct))!;
            sp.GetRequiredService<ITokenProtector>().Unprotect(loaded.Token).Reveal().ShouldBe(token);
        }

        (await KeyCountAsync()).ShouldBeGreaterThan(0L, "the Data Protection key ring is persisted in data_protection_keys");
    }

    [Fact]
    public void Protect_IsRandomized()
    {
        var protector = factory.Services.GetRequiredService<ITokenProtector>();
        var token = new SensitiveString(FakeToken());

        protector.Protect(token).ShouldNotBe(protector.Protect(token));
    }

    [Fact]
    public void Ciphertext_IsBoundToTheCredentialsPurpose()
    {
        // Another Data Protection consumer of the same key ring (e.g. the session cookie) can't read token payloads.
        var protector = factory.Services.GetRequiredService<ITokenProtector>();
        var encrypted = protector.Protect(new SensitiveString(FakeToken()));
        var otherPurpose = factory.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector("FleetConsole.Other");

        Should.Throw<CryptographicException>(() => otherPurpose.Unprotect(encrypted.Value));
        DataProtectionTokenProtector.Purpose.ShouldBe("FleetConsole.Credentials.v1");
    }

    [Fact]
    public void TamperedCiphertext_IsRejected()
    {
        var protector = factory.Services.GetRequiredService<ITokenProtector>();
        var bytes = protector.Protect(new SensitiveString(FakeToken())).Value.ToArray();
        bytes[^1] ^= 0xFF;

        Should.Throw<CryptographicException>(() => protector.Unprotect(new EncryptedToken(bytes)));
    }

    private static bool Contains(byte[] haystack, byte[] needle) => haystack.AsSpan().IndexOf(needle) >= 0;

    private async Task<byte[]> TokenColumnAsync(CredentialId id)
    {
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("select token from credentials where id = @id", connection);
        command.Parameters.AddWithValue("id", id.Value);
        return (byte[])(await command.ExecuteScalarAsync(Ct))!;
    }

    private async Task<long> KeyCountAsync()
    {
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("select count(*) from data_protection_keys", connection);
        return (long)(await command.ExecuteScalarAsync(Ct))!;
    }
}
