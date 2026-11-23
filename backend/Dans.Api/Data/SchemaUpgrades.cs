using System.Data.Common;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Data;

/// <summary>
/// Brings a database created by an earlier version of DANS up to date without losing its data.
/// EnsureCreated() only creates a missing database and never changes existing tables, so every later schema
/// change is applied here as a small, idempotent step (safe to run on every start). Each step is also written
/// out as a SQL script in database/migrations for administrators who prefer to apply changes by hand.
/// </summary>
public static class SchemaUpgrades
{
    public static async Task ApplyAsync(AppDbContext db, ILogger logger)
    {
        // 2026-11-21 — record when a resident agreed to the privacy notice (database/migrations/001_add_privacy_consent.sql).
        await AddColumnIfMissingAsync(db, logger, "Users", "PrivacyConsentAt", sqliteType: "TEXT NULL", sqlServerType: "datetime2 NULL");
    }

    private static async Task AddColumnIfMissingAsync(
        AppDbContext db, ILogger logger, string table, string column, string sqliteType, string sqlServerType)
    {
        var sqlite = db.Database.IsSqlite();
        var connection = db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync();
        try
        {
            // Table and column names are fixed in code (never user input), so building the statements is safe.
            var exists = sqlite
                ? Convert.ToInt64(await ScalarAsync(connection, $"SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = '{column}'")) > 0
                : await ScalarAsync(connection, $"SELECT COL_LENGTH('{table}', '{column}')") is not (null or DBNull);
            if (exists) return;

            await ExecuteAsync(connection, sqlite
                ? $"ALTER TABLE \"{table}\" ADD COLUMN \"{column}\" {sqliteType}"
                : $"ALTER TABLE [{table}] ADD [{column}] {sqlServerType}");
            logger.LogInformation("Database upgraded: added column {Table}.{Column}", table, column);
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    private static async Task<object?> ScalarAsync(DbConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        return await command.ExecuteScalarAsync();
    }

    private static async Task ExecuteAsync(DbConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
}
