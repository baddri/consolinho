using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace FleetConsole.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class IdentityAndAdministration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "audit_entries",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_is_system = table.Column<bool>(type: "boolean", nullable: false),
                    actor_name = table.Column<string>(type: "text", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    target_type = table.Column<string>(type: "text", nullable: false),
                    target_id = table.Column<string>(type: "text", nullable: true),
                    target_name = table.Column<string>(type: "text", nullable: false),
                    cluster_name = table.Column<string>(type: "text", nullable: true),
                    related_username = table.Column<string>(type: "text", nullable: true),
                    summary = table.Column<string>(type: "text", nullable: false),
                    correlation_id = table.Column<string>(type: "text", nullable: true),
                    details = table.Column<string>(type: "jsonb", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_audit_entries", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "clusters",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    display_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    environment = table.Column<string>(type: "text", nullable: false),
                    web_console_url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    connection_settings_changed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: true),
                    ca_bundle = table.Column<string>(type: "text", nullable: true),
                    skip_tls_verify = table.Column<bool>(type: "boolean", nullable: false),
                    api_url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_clusters", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "data_protection_keys",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    friendly_name = table.Column<string>(type: "text", nullable: true),
                    xml = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_data_protection_keys", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    username = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    display_name = table.Column<string>(type: "text", nullable: true),
                    is_admin_by_assignment = table.Column<bool>(type: "boolean", nullable: false),
                    admin_configuration_source = table.Column<string>(type: "text", nullable: true),
                    is_read_only = table.Column<bool>(type: "boolean", nullable: false),
                    is_deactivated = table.Column<bool>(type: "boolean", nullable: false),
                    last_login_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    groups = table.Column<string[]>(type: "text[]", nullable: false),
                    security_stamp = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "credentials",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    cluster_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(63)", maxLength: 63, nullable: false),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    token = table.Column<byte[]>(type: "bytea", nullable: false),
                    fingerprint = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    rotated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    rotated_by = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: true),
                    last_test_failed_step = table.Column<string>(type: "text", nullable: true),
                    last_test_headline = table.Column<string>(type: "text", nullable: true),
                    last_test_succeeded = table.Column<bool>(type: "boolean", nullable: true),
                    last_test_tested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    token_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    token_issued_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    token_subject = table.Column<string>(type: "text", nullable: true),
                    token_type = table.Column<string>(type: "text", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_credentials", x => x.id);
                    table.ForeignKey(
                        name: "fk_credentials_clusters_cluster_id",
                        column: x => x.cluster_id,
                        principalTable: "clusters",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "grants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    cluster_id = table.Column<Guid>(type: "uuid", nullable: false),
                    credential_id = table.Column<Guid>(type: "uuid", nullable: false),
                    access_mode = table.Column<string>(type: "text", nullable: false),
                    granted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    granted_by = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_by = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_grants", x => x.id);
                    table.ForeignKey(
                        name: "fk_grants_clusters_cluster_id",
                        column: x => x.cluster_id,
                        principalTable: "clusters",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_grants_credentials_credential_id",
                        column: x => x.credential_id,
                        principalTable: "credentials",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "fk_grants_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_audit_entries_actor_name",
                table: "audit_entries",
                column: "actor_name");

            migrationBuilder.CreateIndex(
                name: "ix_audit_entries_cluster_name",
                table: "audit_entries",
                column: "cluster_name");

            migrationBuilder.CreateIndex(
                name: "ix_audit_entries_occurred_at_id",
                table: "audit_entries",
                columns: new[] { "occurred_at", "id" },
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "ix_audit_entries_related_username",
                table: "audit_entries",
                column: "related_username");

            migrationBuilder.CreateIndex(
                name: "ix_clusters_name",
                table: "clusters",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_credentials_cluster_id_name",
                table: "credentials",
                columns: new[] { "cluster_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_grants_cluster_id",
                table: "grants",
                column: "cluster_id");

            migrationBuilder.CreateIndex(
                name: "ix_grants_credential_id",
                table: "grants",
                column: "credential_id");

            migrationBuilder.CreateIndex(
                name: "ix_grants_user_id_cluster_id",
                table: "grants",
                columns: new[] { "user_id", "cluster_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_username",
                table: "users",
                column: "username",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_entries");

            migrationBuilder.DropTable(
                name: "data_protection_keys");

            migrationBuilder.DropTable(
                name: "grants");

            migrationBuilder.DropTable(
                name: "credentials");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "clusters");
        }
    }
}
