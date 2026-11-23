namespace Dans.Api.Models;

/// <summary>An emergency hotline shown to residents (MDRRMO, BFP, PNP, hospitals...).</summary>
public class EmergencyContact
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Number { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
}
