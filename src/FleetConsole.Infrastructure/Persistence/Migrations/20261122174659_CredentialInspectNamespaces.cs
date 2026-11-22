using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FleetConsole.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CredentialInspectNamespaces : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "inspect_namespaces",
                table: "credentials",
                type: "text[]",
                nullable: false,
                // Existing credentials have no saved namespaces (NST-5); the DEFAULT stays for raw inserts. The model
                // itself declares no default: the aggregate always writes the column.
                defaultValueSql: "'{}'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "inspect_namespaces",
                table: "credentials");
        }
    }
}
