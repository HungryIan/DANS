namespace Dans.Api.Models;

/// <summary>An official warning issued to residents of one or more barangays.</summary>
public class Alert
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;

    /// <summary>Evacuation and safety instructions, one per line.</summary>
    public string? Instructions { get; set; }

    public DisasterType Type { get; set; }
    public SeverityLevel Severity { get; set; }

    public int IssuedById { get; set; }
    public User IssuedBy { get; set; } = null!;
    public DateTime IssuedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Optional automatic end time. An alert is active until it expires or is lifted.</summary>
    public DateTime? ExpiresAt { get; set; }
    public DateTime? LiftedAt { get; set; }

    /// <summary>The incident report this alert was issued for, if any.</summary>
    public int? ReportId { get; set; }
    public IncidentReport? Report { get; set; }

    /// <summary>Target barangays. An empty list means the whole municipality.</summary>
    public List<Barangay> Barangays { get; set; } = [];
}
