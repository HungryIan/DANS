using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace Dans.Api.Hubs;

/// <summary>
/// Remembers which sign-in session opened each real-time connection, so the connection can be closed the moment
/// that session ends (sign-out, password change, role change or deactivation).
/// SignalR only checks the sign-in cookie when a connection is opened; without this registry a WebSocket opened
/// before such a change would keep receiving events meant for staff (for example reporters' phone numbers).
/// The browser reconnects automatically and is then treated as a visitor.
/// </summary>
public class HubConnectionRegistry
{
    private sealed record Entry(int UserId, string SessionId, HubCallerContext Context);

    private readonly ConcurrentDictionary<string, Entry> _connections = new();

    public void Add(HubCallerContext context, int userId, string sessionId) =>
        _connections[context.ConnectionId] = new Entry(userId, sessionId, context);

    public void Remove(string connectionId) => _connections.TryRemove(connectionId, out _);

    /// <summary>Closes every connection of the user, optionally keeping the ones opened by one session.</summary>
    public int CloseForUser(int userId, string? exceptSessionId = null) =>
        Close(entry => entry.UserId == userId && entry.SessionId != exceptSessionId);

    /// <summary>Closes the connections opened by one sign-in session.</summary>
    public int CloseForSession(string sessionId) => Close(entry => entry.SessionId == sessionId);

    private int Close(Func<Entry, bool> match)
    {
        var closed = 0;
        foreach (var (connectionId, entry) in _connections)
        {
            if (!match(entry)) continue;
            entry.Context.Abort();
            _connections.TryRemove(connectionId, out _);
            closed++;
        }
        return closed;
    }
}
