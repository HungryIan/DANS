using System.Linq.Expressions;
using System.Text.RegularExpressions;
using Dans.Api.Models;

namespace Dans.Api.Dtos;

/// <summary>Entity → DTO projections. The expression versions are translated to SQL by EF Core,
/// so only the columns that are needed are loaded.</summary>
public static partial class Mappings
{
    public static readonly Expression<Func<User, UserDto>> ToUserDto = u => new UserDto(
        u.Id,
        u.FullName,
        u.Email,
        u.PhoneNumber,
        u.Role,
        u.BarangayId,
        u.Barangay != null ? u.Barangay.Name : null,
        u.Address,
        u.IsActive,
        u.CreatedAt);

    public static readonly Expression<Func<IncidentReport, ReportDto>> ToReportDto = r => new ReportDto(
        r.Id,
        ReferenceNo(r.Id, r.CreatedAt),
        r.Type,
        r.Severity,
        r.Status,
        r.BarangayId,
        r.Barangay.Name,
        r.Location,
        r.Description,
        r.PeopleAffected,
        r.Latitude,
        r.Longitude,
        r.ReporterId,
        r.Reporter.FullName,
        r.Reporter.PhoneNumber,
        r.AssignedToId,
        r.AssignedTo != null ? r.AssignedTo.FullName : null,
        r.CreatedAt,
        r.UpdatedAt,
        r.ClosedAt);

    public static Expression<Func<Alert, AlertDto>> ToAlertDto(DateTime now) => a => new AlertDto(
        a.Id,
        a.Title,
        a.Message,
        a.Instructions,
        a.Type,
        a.Severity,
        a.Barangays.OrderBy(b => b.Name).Select(b => new BarangayDto(b.Id, b.Name)).ToList(),
        a.IssuedBy.FullName,
        a.IssuedAt,
        a.ExpiresAt,
        a.LiftedAt,
        a.LiftedAt == null && (a.ExpiresAt == null || a.ExpiresAt > now),
        a.ReportId);

    public static readonly Expression<Func<EvacuationCenter, EvacuationCenterDto>> ToCenterDto = c => new EvacuationCenterDto(
        c.Id,
        c.Name,
        c.BarangayId,
        c.Barangay.Name,
        c.Address,
        c.Capacity,
        c.CurrentOccupancy,
        c.Status,
        c.ContactPerson,
        c.ContactNumber,
        c.Facilities,
        c.Latitude,
        c.Longitude,
        c.UpdatedAt);

    public static NotificationDto ToDto(this Notification n) =>
        new(n.Id, n.Title, n.Message, n.Type, n.Link, n.IsRead, n.CreatedAt);

    public static EmergencyContactDto ToDto(this EmergencyContact c) =>
        new(c.Id, c.Name, c.Number, c.Description, c.SortOrder);

    /// <summary>Human-friendly report number, e.g. RPT-2026-00042.</summary>
    public static string ReferenceNo(int id, DateTime createdAt) => $"RPT-{createdAt:yyyy}-{id:D5}";

    /// <summary>Reads the report id from "RPT-2026-00042", "00042" or "42".</summary>
    public static int? ParseReferenceNo(string text)
    {
        var match = ReferencePattern().Match(text.Trim());
        return match.Success && int.TryParse(match.Groups[1].Value, out var id) && id > 0 ? id : null;
    }

    [GeneratedRegex(@"^(?:RPT-\d{4}-)?0*(\d{1,9})$", RegexOptions.IgnoreCase)]
    private static partial Regex ReferencePattern();
}
