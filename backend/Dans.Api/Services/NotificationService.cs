using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Hubs;
using Dans.Api.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Services;

/// <summary>
/// Saves notifications to each user's inbox and pushes real-time events through SignalR,
/// so people are informed immediately and can still read the message later.
/// </summary>
public class NotificationService(AppDbContext db, IHubContext<NotificationHub> hub)
{
    /// <summary>Sends a personal notification to specific users.</summary>
    public async Task NotifyUsersAsync(IEnumerable<int> userIds, string title, string message, NotificationType type, string? link)
    {
        var notifications = userIds.Distinct()
            .Select(id => new Notification { UserId = id, Title = title, Message = message, Type = type, Link = link })
            .ToList();
        if (notifications.Count == 0) return;

        db.Notifications.AddRange(notifications);
        await db.SaveChangesAsync();

        foreach (var notification in notifications)
            await hub.Clients.User(notification.UserId.ToString()).SendAsync(HubEvents.Notification, notification.ToDto());
    }

    /// <summary>Notifies all active officials and administrators.</summary>
    public async Task NotifyManagersAsync(string title, string message, NotificationType type, string? link, int? exceptUserId = null)
    {
        var managerIds = await db.Users
            .Where(u => u.IsActive && (u.Role == UserRole.Official || u.Role == UserRole.Admin) && u.Id != exceptUserId)
            .Select(u => u.Id)
            .ToListAsync();
        await NotifyUsersAsync(managerIds, title, message, type, link);
    }

    /// <summary>
    /// Notifies every active user who lives in one of the barangays (an empty list means the whole municipality).
    /// </summary>
    /// <param name="pushRealtime">Set to false when a dedicated real-time event (such as an alert popup) is sent instead.</param>
    public async Task NotifyAreaAsync(IReadOnlyCollection<int> barangayIds, string title, string message,
        NotificationType type, string? link, bool pushRealtime = true)
    {
        var users = db.Users.Where(u => u.IsActive);
        if (barangayIds.Count > 0)
            users = users.Where(u => u.BarangayId != null && barangayIds.Contains(u.BarangayId.Value));
        var userIds = await users.Select(u => u.Id).ToListAsync();

        var now = DateTime.UtcNow;
        db.Notifications.AddRange(userIds.Select(id => new Notification
        {
            UserId = id, Title = title, Message = message, Type = type, Link = link, CreatedAt = now,
        }));
        await db.SaveChangesAsync();

        if (pushRealtime)
        {
            var payload = new NotificationDto(0, title, message, type, link, false, now);
            await AreaClients(barangayIds, signedInOnly: true).SendAsync(HubEvents.Notification, payload);
        }
    }

    /// <summary>Shows the alert popup to everyone in the affected area and refreshes alert lists everywhere.</summary>
    public async Task PushAlertIssuedAsync(AlertDto alert, IReadOnlyCollection<int> barangayIds)
    {
        await AreaClients(barangayIds, signedInOnly: false).SendAsync(HubEvents.AlertIssued, alert);
        await hub.Clients.All.SendAsync(HubEvents.AlertsChanged);
    }

    public Task BroadcastAsync(string eventName) => hub.Clients.All.SendAsync(eventName);

    public Task PushToStaffAsync(string eventName, object payload) =>
        hub.Clients.Group(NotificationHub.StaffGroup).SendAsync(eventName, payload);

    private IClientProxy AreaClients(IReadOnlyCollection<int> barangayIds, bool signedInOnly)
    {
        if (barangayIds.Count > 0)
            return hub.Clients.Groups(barangayIds.Select(NotificationHub.BarangayGroup).ToList());
        return signedInOnly ? hub.Clients.Group(NotificationHub.AuthenticatedGroup) : hub.Clients.All;
    }
}
