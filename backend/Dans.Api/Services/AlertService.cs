using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Hubs;
using Dans.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Services;

/// <summary>Issues and lifts alerts. Used by the alerts page and automatically when a report is verified or closed.</summary>
public class AlertService(AppDbContext db, NotificationService notifier)
{
    public IQueryable<Alert> ActiveAlerts(DateTime now) =>
        db.Alerts.Where(a => a.LiftedAt == null && (a.ExpiresAt == null || a.ExpiresAt > now));

    public Task<AlertDto?> GetAsync(int id) =>
        db.Alerts.Where(a => a.Id == id).Select(Mappings.ToAlertDto(DateTime.UtcNow)).FirstOrDefaultAsync();

    /// <summary>Saves the alert, puts it in the inbox of every resident of the target barangays,
    /// and pushes a real-time popup to everyone connected from those barangays.</summary>
    public async Task<AlertDto> IssueAsync(Alert alert)
    {
        db.Alerts.Add(alert);
        await db.SaveChangesAsync();

        var dto = (await GetAsync(alert.Id))!;
        var barangayIds = alert.Barangays.Select(b => b.Id).ToList();
        await notifier.NotifyAreaAsync(barangayIds,
            $"{alert.Severity.ToString().ToUpperInvariant()} ALERT: {alert.Title}",
            alert.Message, NotificationType.Alert, "/alerts", pushRealtime: false);
        await notifier.PushAlertIssuedAsync(dto, barangayIds);
        return dto;
    }

    /// <summary>Ends an alert and tells the affected residents. The alert's Barangays must be loaded.</summary>
    public async Task LiftAsync(Alert alert, string message)
    {
        alert.LiftedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var barangayIds = alert.Barangays.Select(b => b.Id).ToList();
        await notifier.NotifyAreaAsync(barangayIds, $"Alert lifted: {alert.Title}", message, NotificationType.Alert, "/alerts");
        await notifier.BroadcastAsync(HubEvents.AlertsChanged);
    }

    /// <summary>Lifts every active alert that was issued for an incident report.</summary>
    public async Task LiftForReportAsync(int reportId, string message)
    {
        var alerts = await ActiveAlerts(DateTime.UtcNow)
            .Where(a => a.ReportId == reportId)
            .Include(a => a.Barangays)
            .ToListAsync();

        foreach (var alert in alerts)
            await LiftAsync(alert, message);
    }

    public Task<bool> HasActiveAlertForReportAsync(int reportId) =>
        ActiveAlerts(DateTime.UtcNow).AnyAsync(a => a.ReportId == reportId);
}
