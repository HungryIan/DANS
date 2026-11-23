using System.ComponentModel.DataAnnotations;
using Dans.Api.Models;

namespace Dans.Api.Dtos;

public class CreateReportRequest
{
    [Required(ErrorMessage = "Select the type of emergency.")]
    public DisasterType? Type { get; set; }

    [Required(ErrorMessage = "Select how severe the situation is.")]
    public SeverityLevel? Severity { get; set; }

    [Required(ErrorMessage = "Select the barangay where it is happening.")]
    public int? BarangayId { get; set; }

    [Required, StringLength(200, MinimumLength = 3)]
    public string Location { get; set; } = string.Empty;

    [Required, StringLength(2000, MinimumLength = 10)]
    public string Description { get; set; } = string.Empty;

    [Range(0, 100000)]
    public int? PeopleAffected { get; set; }

    [Range(-90, 90)]
    public double? Latitude { get; set; }

    [Range(-180, 180)]
    public double? Longitude { get; set; }
}

public class AddReportUpdateRequest
{
    /// <summary>New status. Leave empty to only add a note.</summary>
    public ReportStatus? Status { get; set; }

    [StringLength(1000)]
    public string? Note { get; set; }

    /// <summary>When verifying a report, also issue an alert to residents of the affected barangay.</summary>
    public bool NotifyResidents { get; set; }
}

public class AssignReportRequest
{
    /// <summary>Staff member to assign, or null to remove the assignment.</summary>
    public int? AssigneeId { get; set; }
}

/// <summary>Filters for the incident list. Dates are ISO timestamps (with time zone).</summary>
public class ReportQuery
{
    public ReportStatus? Status { get; set; }
    public bool ActiveOnly { get; set; }
    public DisasterType? Type { get; set; }
    public int? BarangayId { get; set; }
    public DateTimeOffset? From { get; set; }
    public DateTimeOffset? To { get; set; }
    public string? Search { get; set; }
    public bool AssignedToMe { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public record ReportDto(
    int Id,
    string ReferenceNo,
    DisasterType Type,
    SeverityLevel Severity,
    ReportStatus Status,
    int BarangayId,
    string BarangayName,
    string Location,
    string Description,
    int? PeopleAffected,
    double? Latitude,
    double? Longitude,
    int ReporterId,
    string ReporterName,
    string ReporterPhone,
    int? AssignedToId,
    string? AssignedToName,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? ClosedAt);

public record ReportUpdateDto(
    int Id,
    ReportStatus? Status,
    string? Note,
    string UserName,
    UserRole UserRole,
    DateTime CreatedAt);

/// <summary>A report with its timeline. CanUpdate/CanManage tell the client which actions to show.</summary>
public record ReportDetailDto(
    ReportDto Report,
    IReadOnlyList<ReportUpdateDto> Updates,
    bool CanUpdate,
    bool CanManage,
    bool HasActiveAlert);
