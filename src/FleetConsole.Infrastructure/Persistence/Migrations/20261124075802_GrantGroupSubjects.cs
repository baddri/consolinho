using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FleetConsole.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class GrantGroupSubjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "user_id",
                table: "grants",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "group_name",
                table: "grants",
                type: "character varying(253)",
                maxLength: 253,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "priority",
                table: "grants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "subject_kind",
                table: "grants",
                type: "text",
                nullable: false,
                defaultValue: "User");   // existing rows are user grants (GRP-1)

            // The default only backfills existing rows; the model has none, so new rows must state their kind.
            migrationBuilder.Sql("ALTER TABLE grants ALTER COLUMN subject_kind DROP DEFAULT;");

            migrationBuilder.CreateIndex(
                name: "ix_grants_cluster_id_priority",
                table: "grants",
                columns: new[] { "cluster_id", "priority" },
                unique: true,
                filter: "subject_kind = 'Group'");

            migrationBuilder.CreateIndex(
                name: "ix_grants_group_name",
                table: "grants",
                column: "group_name");

            migrationBuilder.CreateIndex(
                name: "ix_grants_group_name_cluster_id",
                table: "grants",
                columns: new[] { "group_name", "cluster_id" },
                unique: true,
                filter: "subject_kind = 'Group'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_grants_subject",
                table: "grants",
                sql: "(subject_kind = 'User' AND user_id IS NOT NULL AND group_name IS NULL AND priority IS NULL) OR (subject_kind = 'Group' AND user_id IS NULL AND group_name IS NOT NULL AND priority BETWEEN 1 AND 1000)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Group grants can't exist without these columns, and user_id becomes NOT NULL again.
            migrationBuilder.Sql("DELETE FROM grants WHERE subject_kind = 'Group';");

            migrationBuilder.DropIndex(
                name: "ix_grants_cluster_id_priority",
                table: "grants");

            migrationBuilder.DropIndex(
                name: "ix_grants_group_name",
                table: "grants");

            migrationBuilder.DropIndex(
                name: "ix_grants_group_name_cluster_id",
                table: "grants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_grants_subject",
                table: "grants");

            migrationBuilder.DropColumn(
                name: "group_name",
                table: "grants");

            migrationBuilder.DropColumn(
                name: "priority",
                table: "grants");

            migrationBuilder.DropColumn(
                name: "subject_kind",
                table: "grants");

            migrationBuilder.AlterColumn<Guid>(
                name: "user_id",
                table: "grants",
                type: "uuid",
                nullable: false,
                // No default (EF scaffolds Guid.Empty): the DELETE above leaves no NULLs, and a leftover default would
                // survive the next Up and fill user_id on group-grant inserts, failing ck_grants_subject.
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
