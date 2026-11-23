using System.ComponentModel.DataAnnotations;
using Dans.Api.Models;

namespace Dans.Api.Dtos;

public class CreateAlertRequest
{
    [Required, StringLength(150, MinimumLength = 5)]
    public string Title { get; set; } = string.Empty;

    [Required, StringLength(2000, MinimumLength = 10)]
    public string Message { get; set; } = string.Empty;

    [StringLength(4000)]
    public string? Instructions { get; set; }

    [Required]
    public DisasterType? Type { get; set; }

    [Required]
    public SeverityLevel? Severity { get; set; }

    /// <summary>Barangays to warn. Leave empty to warn the whole municipality.</summary>
    public List<int> BarangayIds { get; set; } = [];

    public DateTime? ExpiresAt { get; set; }

    /// <summary>Optional incident report this alert is about.</summary>
    public int? ReportId { get; set; }
}

public record AlertDto(
    int Id,
    string Title,
    string Message,
    string? Instructions,
    DisasterType Type,
    SeverityLevel Severity,
    IReadOnlyList<BarangayDto> Barangays,
    string IssuedBy,
    DateTime IssuedAt,
    DateTime? ExpiresAt,
    DateTime? LiftedAt,
    bool IsActive,
    int? ReportId);
