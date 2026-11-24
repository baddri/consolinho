using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FleetConsole.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UserGroupChecks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_group_checks",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    checked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_group_checks", x => x.user_id);
                    table.ForeignKey(
                        name: "fk_user_group_checks_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_group_checks");
        }
    }
}
