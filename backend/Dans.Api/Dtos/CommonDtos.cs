using System.ComponentModel.DataAnnotations;
using Dans.Api.Models;

namespace Dans.Api.Dtos;

public record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize);

public record BarangayDto(int Id, string Name);

public record BarangayStatsDto(int Id, string Name, int Residents, int EvacuationCenters, int ActiveIncidents);

public class SaveBarangayRequest
{
    [Required, StringLength(100, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;
}

public class UpdateRoleRequest
{
    [Required]
    public UserRole? Role { get; set; }
}

public class UpdateUserStatusRequest
{
    public bool IsActive { get; set; }
}

public record AssignableUserDto(int Id, string FullName, UserRole Role, string? BarangayName);

public record NotificationDto(
    int Id,
    string Title,
    string Message,
    NotificationType Type,
    string? Link,
    bool IsRead,
    DateTime CreatedAt);

public record UnreadCountDto(int Count);

public record CountItem(string Label, int Count);

public record DashboardDto(
    int ActiveAlerts,
    int PendingReports,
    int VerifiedReports,
    int RespondingReports,
    int ResolvedLast7Days,
    int ReportsLast24Hours,
    int TotalReports,
    int OpenCenters,
    int TotalCenters,
    int OpenCapacity,
    int TotalEvacuees,
    IReadOnlyList<CountItem> ActiveByBarangay,
    IReadOnlyList<CountItem> ByTypeLast30Days,
    IReadOnlyList<CountItem> ByStatus,
    IReadOnlyList<ReportDto> RecentReports);
