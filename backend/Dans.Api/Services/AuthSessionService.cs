using System.Security.Cryptography;
using Dans.Api.Data;
using Dans.Api.Hubs;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Dans.Api.Services;

/// <summary>The data about a valid session that is needed to renew its cookie.</summary>
public record ActiveSession(string Id, DateTime ExpiresAt, int UserId, string FullName, string Email, UserRole Role);

/// <summary>
/// Server-side sign-in sessions. Each sign-in creates a <see cref="UserSession"/> row and an HttpOnly cookie
/// holding a JWT that names the session. Every request re-checks the row, so sessions can be revoked at once.
/// </summary>
public class AuthSessionService(AppDbContext db, TokenService tokens, IOptions<JwtOptions> options, HubConnectionRegistry connections)
{
    private TimeSpan Lifetime => TimeSpan.FromHours(options.Value.ExpiresInHours);

    /// <summary>Starts a new session for the user and sets the sign-in cookie. Returns when it expires.</summary>
    public async Task<DateTime> SignInAsync(HttpContext http, User user)
    {
        var now = DateTime.UtcNow;

        // Housekeeping: forget this user's expired or revoked sessions.
        await db.Sessions
            .Where(s => s.UserId == user.Id && (s.ExpiresAt < now || s.RevokedAt != null))
            .ExecuteDeleteAsync();

        var userAgent = http.Request.Headers.UserAgent.ToString();
        var session = new UserSession
        {
            Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant(),
            UserId = user.Id,
            CreatedAt = now,
            ExpiresAt = now + Lifetime,
            UserAgent = userAgent.Length > 256 ? userAgent[..256] : userAgent,
        };
        db.Sessions.Add(session);
        await db.SaveChangesAsync();

        var token = tokens.CreateToken(user.Id, user.FullName, user.Email, user.Role, session.Id, session.ExpiresAt);
        AuthCookie.Append(http.Response, token, session.ExpiresAt);
        return session.ExpiresAt;
    }

    /// <summary>Returns the session if it exists, is not revoked or expired, and its user is active with the same role.</summary>
    public async Task<ActiveSession?> FindActiveAsync(int? userId, string? sessionId, string? role)
    {
        if (userId is null || string.IsNullOrEmpty(sessionId) || !Enum.TryParse<UserRole>(role, out var userRole))
            return null;

        var now = DateTime.UtcNow;
        return await db.Sessions.AsNoTracking()
            .Where(s => s.Id == sessionId && s.UserId == userId && s.RevokedAt == null && s.ExpiresAt > now
                        && s.User.IsActive && s.User.Role == userRole)
            .Select(s => new ActiveSession(s.Id, s.ExpiresAt, s.UserId, s.User.FullName, s.User.Email, s.User.Role))
            .FirstOrDefaultAsync();
    }

    /// <summary>Sliding expiration: once half of the lifetime has passed, extend the session and refresh the cookie.</summary>
    public async Task RenewIfDueAsync(HttpContext http, ActiveSession session)
    {
        var now = DateTime.UtcNow;
        if (session.ExpiresAt - now > Lifetime / 2) return;

        var expiresAt = now + Lifetime;
        await db.Sessions.Where(s => s.Id == session.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAt, expiresAt));
        var token = tokens.CreateToken(session.UserId, session.FullName, session.Email, session.Role, session.Id, expiresAt);
        AuthCookie.Append(http.Response, token, expiresAt);
    }

    /// <summary>Ends the current session (server side), closes its real-time connections and removes the cookie.</summary>
    public async Task SignOutAsync(HttpContext http)
    {
        var sessionId = http.User.FindFirst(AuthClaims.SessionId)?.Value;
        if (sessionId is not null)
        {
            await db.Sessions.Where(s => s.Id == sessionId).ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, DateTime.UtcNow));
            connections.CloseForSession(sessionId);
        }
        AuthCookie.Delete(http.Response);
    }

    /// <summary>Signs the user out on every device (optionally keeping one session) and closes their real-time connections.</summary>
    public async Task<int> RevokeAllAsync(int userId, string? exceptSessionId = null)
    {
        var now = DateTime.UtcNow;
        var revoked = await db.Sessions
            .Where(s => s.UserId == userId && s.RevokedAt == null && s.Id != exceptSessionId)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now));
        connections.CloseForUser(userId, exceptSessionId);
        return revoked;
    }
}
