using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FleetConsole.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ClusterDistribution : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "distribution",
                table: "clusters",
                type: "text",
                nullable: false,
                // Clusters registered before CP3.7 were all OpenShift (ADR-0032); enums are stored by name.
                defaultValue: "OpenShift");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "distribution",
                table: "clusters");
        }
    }
}
