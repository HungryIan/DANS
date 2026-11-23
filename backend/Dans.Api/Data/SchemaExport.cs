using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Data;

/// <summary>
/// Writes the CREATE scripts of the current database design for SQLite and SQL Server, for documentation and for
/// administrators who create the database by hand. No database connection is needed.
/// Usage: <c>dotnet run -- --export-schema ../../database</c>
/// </summary>
public static class SchemaExport
{
    public static void Write(string directory)
    {
        Directory.CreateDirectory(directory);
        Write(directory, "schema.sqlite.sql", "SQLite", new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite("Data Source=:memory:").Options);
        Write(directory, "schema.sqlserver.sql", "SQL Server", new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=localhost;Database=DansDb;Trusted_Connection=True").Options);
    }

    private static void Write(string directory, string fileName, string provider, DbContextOptions<AppDbContext> options)
    {
        using var db = new AppDbContext(options);
        var header =
            $"-- DANS (Disaster Alert and Notification System) database schema for {provider}.\n" +
            "-- Generated from the Entity Framework Core model with: dotnet run -- --export-schema <folder>\n" +
            "-- The API creates this schema automatically on first start; this file is for reference and manual setup.\n\n";
        var path = Path.Combine(directory, fileName);
        File.WriteAllText(path, header + db.Database.GenerateCreateScript().Replace("\r\n", "\n"));
        Console.WriteLine($"Wrote {Path.GetFullPath(path)}");
    }
}
