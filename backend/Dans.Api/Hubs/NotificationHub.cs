using Dans.Api.Data;
using Dans.Api.Infrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Hubs;

/// <summary>
/// Real-time channel used to push alerts and notifications to browsers.
/// Anyone may connect (so public alerts reach visitors too). Signed-in users are also added to groups:
/// one for their barangay, one for all signed-in users, and one for staff, so each message
/// reaches only the people it concerns. Clients only listen; the hub has no methods they can call.
/// </summary>
public class NotificationHub(AppDbContext db, HubConnectionRegistry connections) : Hub
{
    public const string Path = "/hubs/notifications";
    public const string AuthenticatedGroup = "authenticated";
    public const string StaffGroup = "staff";

    public static string BarangayGroup(int barangayId) => $"barangay-{barangayId}";

    public override async Task OnConnectedAsync()
    {
        var principal = Context.User;
        var userId = principal?.FindUserId();
        var sessionId = principal?.FindFirst(AuthClaims.SessionId)?.Value;
        if (userId is not null && sessionId is not null)
        {
            var user = await db.Users.AsNoTracking()
                .Where(u => u.Id == userId && u.IsActive)
                .Select(u => new { u.Role, u.BarangayId })
                .FirstOrDefaultAsync();

            if (user is not null)
            {
                // Registered first, so a sign-out that happens while the groups are being joined still closes it.
                connections.Add(Context, userId.Value, sessionId);
                await Groups.AddToGroupAsync(Context.ConnectionId, AuthenticatedGroup);
                if (user.BarangayId is int barangayId)
                    await Groups.AddToGroupAsync(Context.ConnectionId, BarangayGroup(barangayId));
                if (Roles.IsStaff(user.Role))
                    await Groups.AddToGroupAsync(Context.ConnectionId, StaffGroup);
            }
        }

        await base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        connections.Remove(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}

/// <summary>Names of the events the server sends to the Angular client.</summary>
public static class HubEvents
{
    /// <summary>A new alert for the receiver's area (payload: AlertDto).</summary>
    public const string AlertIssued = "alertIssued";

    /// <summary>The list of active alerts changed (no payload).</summary>
    public const string AlertsChanged = "alertsChanged";

    /// <summary>A new item in the receiver's notification inbox (payload: NotificationDto).</summary>
    public const string Notification = "notification";

    /// <summary>An incident report was created or updated (payload: ReportDto, staff only).</summary>
    public const string ReportChanged = "reportChanged";

    /// <summary>Evacuation center information changed (no payload).</summary>
    public const string CentersChanged = "centersChanged";
}
