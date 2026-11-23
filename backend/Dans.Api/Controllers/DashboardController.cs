using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Controllers;

/// <summary>Summary numbers for the operations dashboard.</summary>
[Route("api/dashboard")]
[Authorize(Roles = Roles.Staff)]
public class DashboardController(AppDbContext db) : ApiControllerBase
{
    [HttpGet]
    public async Task<DashboardDto> Get()
    {
        var now = DateTime.UtcNow;
        var last24Hours = now.AddHours(-24);
        var last7Days = now.AddDays(-7);
        var last30Days = now.AddDays(-30);

        var statusCounts = await db.Reports
            .GroupBy(r => r.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();
        int CountOf(ReportStatus status) => statusCounts.FirstOrDefault(x => x.Status == status)?.Count ?? 0;

        var activeAlerts = await db.Alerts.CountAsync(a => a.LiftedAt == null && (a.ExpiresAt == null || a.ExpiresAt > now));
        var reportsLast24Hours = await db.Reports.CountAsync(r => r.CreatedAt >= last24Hours);
        var resolvedLast7Days = await db.Reports.CountAsync(r => r.Status == ReportStatus.Resolved && r.ClosedAt >= last7Days);

        var centers = await db.EvacuationCenters.Select(c => new { c.Status, c.Capacity, c.CurrentOccupancy }).ToListAsync();
        var activeCenters = centers.Where(c => c.Status != CenterStatus.Closed).ToList();

        var barangayNames = await db.Barangays.ToDictionaryAsync(b => b.Id, b => b.Name);
        var activeByBarangay = (await db.Reports
                .Where(r => ReportStatuses.Active.Contains(r.Status))
                .GroupBy(r => r.BarangayId)
                .Select(g => new { BarangayId = g.Key, Count = g.Count() })
                .ToListAsync())
            .Select(x => new CountItem(barangayNames.GetValueOrDefault(x.BarangayId, "Unknown"), x.Count))
            .OrderByDescending(x => x.Count).ThenBy(x => x.Label)
            .ToList();

        var byType = (await db.Reports
                .Where(r => r.CreatedAt >= last30Days)
                .GroupBy(r => r.Type)
                .Select(g => new { Type = g.Key, Count = g.Count() })
                .ToListAsync())
            .Select(x => new CountItem(x.Type.ToString(), x.Count))
            .OrderByDescending(x => x.Count).ThenBy(x => x.Label)
            .ToList();

        var byStatus = Enum.GetValues<ReportStatus>().Select(s => new CountItem(s.ToString(), CountOf(s))).ToList();

        var recentReports = await db.Reports
            .OrderByDescending(r => r.CreatedAt)
            .Take(6)
            .Select(Mappings.ToReportDto)
            .ToListAsync();

        return new DashboardDto(
            ActiveAlerts: activeAlerts,
            PendingReports: CountOf(ReportStatus.Pending),
            VerifiedReports: CountOf(ReportStatus.Verified),
            RespondingReports: CountOf(ReportStatus.Responding),
            ResolvedLast7Days: resolvedLast7Days,
            ReportsLast24Hours: reportsLast24Hours,
            TotalReports: statusCounts.Sum(x => x.Count),
            OpenCenters: activeCenters.Count,
            TotalCenters: centers.Count,
            OpenCapacity: activeCenters.Sum(c => c.Capacity),
            TotalEvacuees: centers.Sum(c => c.CurrentOccupancy),
            ActiveByBarangay: activeByBarangay,
            ByTypeLast30Days: byType,
            ByStatus: byStatus,
            RecentReports: recentReports);
    }
}
