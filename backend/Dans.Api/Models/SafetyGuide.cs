namespace Dans.Api.Models;

/// <summary>What to do before, during and after a disaster. Each tips field holds one tip per line.</summary>
public class SafetyGuide
{
    public int Id { get; set; }
    public DisasterType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string BeforeTips { get; set; } = string.Empty;
    public string DuringTips { get; set; } = string.Empty;
    public string AfterTips { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
