using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Tests.Clusters;

public sealed class CaBundleTests
{
    [Fact]
    public void Create_ParsesSingleCertificate_WithDisplayInfo()
    {
        var pem = DomainTestData.CertificatePem("root-ca", validDays: 30);
        using var expected = X509Certificate2.CreateFromPem(pem);

        var result = CaBundle.Create(pem);

        result.IsSuccess.ShouldBeTrue();
        var info = result.Value.Certificates.ShouldHaveSingleItem();
        info.Subject.ShouldBe("CN=root-ca");
        info.Issuer.ShouldBe("CN=root-ca");
        info.NotBefore.ShouldBe(new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero));
        info.NotAfter.ShouldBe(new DateTimeOffset(2026, 1, 31, 0, 0, 0, TimeSpan.Zero));
        info.NotAfter.Offset.ShouldBe(TimeSpan.Zero);
        var hex = Convert.ToHexString(SHA256.HashData(expected.RawData));
        info.Sha256Fingerprint.ShouldBe(string.Join(':', hex.Chunk(2).Select(c => new string(c))));
        info.Sha256Fingerprint.ShouldMatch("^([0-9A-F]{2}:){31}[0-9A-F]{2}$");
    }

    [Fact]
    public void Create_ParsesEveryCertificateInOrder_AndIgnoresTextAroundBlocks()
    {
        var pem = $"# intermediate\n{DomainTestData.CertificatePem("first")}\nsome comment\n{DomainTestData.CertificatePem("second")}";

        var result = CaBundle.Create(pem);

        result.IsSuccess.ShouldBeTrue();
        result.Value.Certificates.Select(c => c.Subject).ShouldBe(["CN=first", "CN=second"]);
    }

    [Fact]
    public void Create_TrimsSurroundingWhitespace()
    {
        var pem = DomainTestData.CertificatePem();

        CaBundle.Create($"\n  {pem}\n\n").Value.Pem.ShouldBe(pem.Trim());
    }

    public static TheoryData<string?, string> InvalidBundles => new()
    {
        { null, "The CA bundle must contain at least one PEM certificate." },
        { "  \n", "The CA bundle must contain at least one PEM certificate." },
        { "not a certificate", "The CA bundle must contain at least one PEM certificate." },
        {
            "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----",
            "The CA bundle must contain at least one PEM certificate."
        },
        {
            "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----",
            "The CA bundle contains a certificate that can't be parsed."
        },
        {
            "-----BEGIN CERTIFICATE-----\nnot base64!\n-----END CERTIFICATE-----",
            "The CA bundle must contain at least one PEM certificate."
        },
    };

    [Theory]
    [MemberData(nameof(InvalidBundles))]
    public void Create_RejectsInvalidPem_AsFieldErrorOnCaBundle(string? pem, string message)
    {
        var result = CaBundle.Create(pem);

        ShouldBeCaBundleError(result, message);
    }

    [Fact]
    public void Create_RejectsPrivateKeys_EvenNextToACertificate()
    {
        var withKey = DomainTestData.CertificatePem() + "\n" + DomainTestData.PrivateKeyPem();

        ShouldBeCaBundleError(CaBundle.Create(withKey), "The CA bundle must not contain a private key.");
        ShouldBeCaBundleError(CaBundle.Create(DomainTestData.PrivateKeyPem()), "The CA bundle must not contain a private key.");
    }

    [Fact]
    public void Create_EnforcesSizeLimit()
    {
        // The limit applies after trimming, so build the bundle from trimmed text to hit it exactly.
        var pem = DomainTestData.CertificatePem().Trim();
        var padding = new string('#', CaBundle.MaxSizeBytes - pem.Length - 1);

        CaBundle.Create(padding + "\n" + pem).IsSuccess.ShouldBeTrue();
        ShouldBeCaBundleError(CaBundle.Create(padding + "#\n" + pem), "The CA bundle must be at most 256 KiB.");
    }

    [Fact]
    public void Equality_ComparesPemOnly()
    {
        var pem = DomainTestData.CertificatePem();

        CaBundle.Create(pem).Value.ShouldBe(CaBundle.Create(pem + "\n").Value);
        CaBundle.Create(pem).Value.GetHashCode().ShouldBe(CaBundle.Create(pem).Value.GetHashCode());
        CaBundle.Create(pem).Value.ShouldNotBe(CaBundle.Create(DomainTestData.CertificatePem()).Value);
    }

    [Fact]
    public void ToString_DoesNotPrintPem()
    {
        var bundle = CaBundle.Create(DomainTestData.CertificatePem()).Value;

        bundle.ToString().ShouldBe("CaBundle { 1 certificate(s) }");
    }

    private static void ShouldBeCaBundleError(Result<CaBundle> result, string message)
    {
        result.IsFailure.ShouldBeTrue();
        var error = result.Error.ShouldBeOfType<ValidationError>();
        error.Errors.ShouldHaveSingleItem().Key.ShouldBe("caBundle");
        error.Errors["caBundle"].ShouldBe([message]);
    }
}
