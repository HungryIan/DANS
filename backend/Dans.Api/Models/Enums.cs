namespace Dans.Api.Models;

/// <summary>Who is using the system. Public registration always creates a <see cref="Resident"/>;
/// administrators promote accounts to the other roles.</summary>
public enum UserRole
{
    Resident,
    Volunteer,
    Responder,
    Official,
    Admin
}

public enum DisasterType
{
    Flood,
    Earthquake,
    Landslide,
    Fire,
    Typhoon,
    Medical,
    Accident,
    Other
}

public enum SeverityLevel
{
    Low,
    Moderate,
    High,
    Critical
}

/// <summary>Lifecycle of an incident report: Pending → Verified → Responding → Resolved (or Dismissed).</summary>
public enum ReportStatus
{
    Pending,
    Verified,
    Responding,
    Resolved,
    Dismissed
}

/// <summary>Groups of report statuses used by queries and business rules.</summary>
public static class ReportStatuses
{
    /// <summary>Reports that still need attention (shown on the incident monitor).</summary>
    public static readonly ReportStatus[] Active = [ReportStatus.Pending, ReportStatus.Verified, ReportStatus.Responding];

    /// <summary>Resolved or dismissed: the report is closed and only officials may reopen it.</summary>
    public static bool IsClosed(ReportStatus status) => status is ReportStatus.Resolved or ReportStatus.Dismissed;
}

public enum CenterStatus
{
    Open,
    Full,
    Closed
}

public enum NotificationType
{
    Alert,
    Report,
    Assignment,
    Evacuation,
    System
}
