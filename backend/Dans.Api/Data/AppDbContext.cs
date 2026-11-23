using Dans.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Dans.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Barangay> Barangays => Set<Barangay>();
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<IncidentReport> Reports => Set<IncidentReport>();
    public DbSet<ReportUpdate> ReportUpdates => Set<ReportUpdate>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<EvacuationCenter> EvacuationCenters => Set<EvacuationCenter>();
    public DbSet<SafetyGuide> SafetyGuides => Set<SafetyGuide>();
    public DbSet<EmergencyContact> EmergencyContacts => Set<EmergencyContact>();
    public DbSet<UserSession> Sessions => Set<UserSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.FullName).HasMaxLength(100);
            e.Property(u => u.Email).HasMaxLength(150);
            e.Property(u => u.PhoneNumber).HasMaxLength(20);
            e.Property(u => u.Address).HasMaxLength(200);
            e.HasOne(u => u.Barangay).WithMany().HasForeignKey(u => u.BarangayId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Barangay>(e =>
        {
            e.HasIndex(b => b.Name).IsUnique();
            e.Property(b => b.Name).HasMaxLength(100);
        });

        modelBuilder.Entity<Alert>(e =>
        {
            e.Property(a => a.Title).HasMaxLength(150);
            e.Property(a => a.Message).HasMaxLength(2000);
            e.Property(a => a.Instructions).HasMaxLength(4000);
            e.HasOne(a => a.IssuedBy).WithMany().HasForeignKey(a => a.IssuedById).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(a => a.Report).WithMany().HasForeignKey(a => a.ReportId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(a => a.Barangays).WithMany().UsingEntity(j => j.ToTable("AlertBarangays"));
            e.HasIndex(a => a.IssuedAt);
        });

        modelBuilder.Entity<IncidentReport>(e =>
        {
            e.ToTable("IncidentReports");
            e.Property(r => r.Location).HasMaxLength(200);
            e.Property(r => r.Description).HasMaxLength(2000);
            e.HasOne(r => r.Reporter).WithMany().HasForeignKey(r => r.ReporterId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.AssignedTo).WithMany().HasForeignKey(r => r.AssignedToId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(r => r.Barangay).WithMany().HasForeignKey(r => r.BarangayId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(r => r.Updates).WithOne(u => u.Report).HasForeignKey(u => u.ReportId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(r => r.Status);
            e.HasIndex(r => r.CreatedAt);
        });

        modelBuilder.Entity<ReportUpdate>(e =>
        {
            e.Property(u => u.Note).HasMaxLength(1000);
            e.HasOne(u => u.User).WithMany().HasForeignKey(u => u.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Notification>(e =>
        {
            e.Property(n => n.Title).HasMaxLength(200);
            e.Property(n => n.Message).HasMaxLength(2000);
            e.Property(n => n.Link).HasMaxLength(200);
            e.HasOne(n => n.User).WithMany().HasForeignKey(n => n.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(n => new { n.UserId, n.IsRead });
        });

        modelBuilder.Entity<EvacuationCenter>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(150);
            e.Property(c => c.Address).HasMaxLength(250);
            e.Property(c => c.ContactPerson).HasMaxLength(100);
            e.Property(c => c.ContactNumber).HasMaxLength(30);
            e.Property(c => c.Facilities).HasMaxLength(500);
            e.HasOne(c => c.Barangay).WithMany().HasForeignKey(c => c.BarangayId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SafetyGuide>(e =>
        {
            e.Property(g => g.Title).HasMaxLength(150);
            e.Property(g => g.Summary).HasMaxLength(1000);
        });

        modelBuilder.Entity<UserSession>(e =>
        {
            e.ToTable("UserSessions");
            e.HasKey(s => s.Id);
            e.Property(s => s.Id).HasMaxLength(64);
            e.Property(s => s.UserAgent).HasMaxLength(256);
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(s => s.UserId);
        });

        modelBuilder.Entity<EmergencyContact>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(100);
            e.Property(c => c.Number).HasMaxLength(50);
            e.Property(c => c.Description).HasMaxLength(250);
        });

        // Every DateTime is stored in UTC. SQLite forgets the "kind" of a date, so flag values read back
        // as UTC; the API then always sends ISO dates ending in "Z" and browsers show the correct local time.
        var utcConverter = new ValueConverter<DateTime, DateTime>(
            v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                if (property.ClrType == typeof(DateTime) || property.ClrType == typeof(DateTime?))
                    property.SetValueConverter(utcConverter);
            }
        }
    }
}
