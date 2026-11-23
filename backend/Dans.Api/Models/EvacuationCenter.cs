namespace Dans.Api.Models;

public class EvacuationCenter
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    public int BarangayId { get; set; }
    public Barangay Barangay { get; set; } = null!;

    public string Address { get; set; } = string.Empty;
    public int Capacity { get; set; }
    public int CurrentOccupancy { get; set; }
    public CenterStatus Status { get; set; } = CenterStatus.Closed;

    public string? ContactPerson { get; set; }
    public string? ContactNumber { get; set; }

    /// <summary>Comma-separated list, e.g. "Water, Toilets, Medical station".</summary>
    public string? Facilities { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
