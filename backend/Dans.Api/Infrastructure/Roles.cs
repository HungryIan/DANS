using Dans.Api.Models;

namespace Dans.Api.Infrastructure;

/// <summary>Role names used in [Authorize(Roles = ...)] attributes. A comma means "any of these roles".</summary>
public static class Roles
{
    public const string Resident = nameof(UserRole.Resident);
    public const string Volunteer = nameof(UserRole.Volunteer);
    public const string Responder = nameof(UserRole.Responder);
    public const string Official = nameof(UserRole.Official);
    public const string Admin = nameof(UserRole.Admin);

    /// <summary>Local officials and community administrators: manage alerts, reports, centers and guides.</summary>
    public const string Managers = Official + "," + Admin;

    /// <summary>Everyone who works on incidents: field personnel plus managers.</summary>
    public const string Staff = Volunteer + "," + Responder + "," + Official + "," + Admin;

    public static bool IsManager(UserRole role) => role is UserRole.Official or UserRole.Admin;

    public static bool IsStaff(UserRole role) => role is not UserRole.Resident;
}
