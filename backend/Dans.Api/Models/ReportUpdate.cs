namespace Dans.Api.Models;

/// <summary>One entry in an incident report's timeline (status change, assignment or note).</summary>
public class ReportUpdate
{
    public int Id { get; set; }

    public int ReportId { get; set; }
    public IncidentReport Report { get; set; } = null!;

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    /// <summary>The new status, when this update changed it.</summary>
    public ReportStatus? Status { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
