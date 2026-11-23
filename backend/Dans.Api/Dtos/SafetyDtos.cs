using System.ComponentModel.DataAnnotations;
using Dans.Api.Infrastructure;
using Dans.Api.Models;

namespace Dans.Api.Dtos;

public class SaveEvacuationCenterRequest
{
    [Required, StringLength(150, MinimumLength = 3)]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Select the barangay of the evacuation center.")]
    public int? BarangayId { get; set; }

    [Required, StringLength(250, MinimumLength = 3)]
    public string Address { get; set; } = string.Empty;

    [Range(1, 100000, ErrorMessage = "Capacity must be at least 1.")]
    public int Capacity { get; set; }

    [Range(0, 100000)]
    public int CurrentOccupancy { get; set; }

    [Required]
    public CenterStatus? Status { get; set; }

    [StringLength(100)]
    public string? ContactPerson { get; set; }

    [StringLength(30), RegularExpression(Text.ContactNumberPattern, ErrorMessage = Text.ContactNumberMessage)]
    public string? ContactNumber { get; set; }

    [StringLength(500)]
    public string? Facilities { get; set; }

    [Range(-90, 90)]
    public double? Latitude { get; set; }

    [Range(-180, 180)]
    public double? Longitude { get; set; }
}

public class UpdateOccupancyRequest
{
    [Range(0, 100000)]
    public int CurrentOccupancy { get; set; }

    /// <summary>Optional new status. When omitted, Open/Full is switched automatically from the occupancy.</summary>
    public CenterStatus? Status { get; set; }
}

public record EvacuationCenterDto(
    int Id,
    string Name,
    int BarangayId,
    string BarangayName,
    string Address,
    int Capacity,
    int CurrentOccupancy,
    CenterStatus Status,
    string? ContactPerson,
    string? ContactNumber,
    string? Facilities,
    double? Latitude,
    double? Longitude,
    DateTime UpdatedAt);

public class SaveSafetyGuideRequest
{
    [Required]
    public DisasterType? Type { get; set; }

    [Required, StringLength(150, MinimumLength = 3)]
    public string Title { get; set; } = string.Empty;

    [Required, StringLength(1000, MinimumLength = 10)]
    public string Summary { get; set; } = string.Empty;

    public List<string> Before { get; set; } = [];
    public List<string> During { get; set; } = [];
    public List<string> After { get; set; } = [];
}

public record SafetyGuideDto(
    int Id,
    DisasterType Type,
    string Title,
    string Summary,
    IReadOnlyList<string> Before,
    IReadOnlyList<string> During,
    IReadOnlyList<string> After,
    DateTime UpdatedAt)
{
    public static SafetyGuideDto From(SafetyGuide g) => new(
        g.Id, g.Type, g.Title, g.Summary,
        Text.Lines(g.BeforeTips), Text.Lines(g.DuringTips), Text.Lines(g.AfterTips),
        g.UpdatedAt);
}

public class SaveEmergencyContactRequest
{
    [Required, StringLength(100, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [Required, StringLength(50, MinimumLength = 3), RegularExpression(Text.ContactNumberPattern, ErrorMessage = Text.ContactNumberMessage)]
    public string Number { get; set; } = string.Empty;

    [StringLength(250)]
    public string? Description { get; set; }

    [Range(0, 1000)]
    public int SortOrder { get; set; }
}

public record EmergencyContactDto(int Id, string Name, string Number, string? Description, int SortOrder);
