namespace Dans.Api.Models;

/// <summary>An emergency reported by a user. Every change is recorded in <see cref="Updates"/>
/// so the full history is kept for future reference.</summary>
public class IncidentReport
{
    public int Id { get; set; }

    public int ReporterId { get; set; }
    public User Reporter { get; set; } = null!;

    public DisasterType Type { get; set; }
    public SeverityLevel Severity { get; set; }

    public int BarangayId { get; set; }
    public Barangay Barangay { get; set; } = null!;

    /// <summary>Purok, street or landmark where the incident is happening.</summary>
    public string Location { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int? PeopleAffected { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public ReportStatus Status { get; set; } = ReportStatus.Pending;

    /// <summary>Responder, volunteer or official handling the incident.</summary>
    public int? AssignedToId { get; set; }
    public User? AssignedTo { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the report was resolved or dismissed.</summary>
    public DateTime? ClosedAt { get; set; }

    public List<ReportUpdate> Updates { get; set; } = [];
}
