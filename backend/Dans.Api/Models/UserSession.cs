namespace Dans.Api.Models;

/// <summary>
/// A signed-in browser. The session id is stored inside the sign-in cookie, and every request checks that the
/// session still exists and is not revoked — so signing out, changing the password or deactivating an
/// account takes effect immediately.
/// </summary>
public class UserSession
{
    /// <summary>Random, unguessable identifier.</summary>
    public string Id { get; set; } = string.Empty;

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Extended automatically while the user keeps using the app (sliding expiration).</summary>
    public DateTime ExpiresAt { get; set; }

    public DateTime? RevokedAt { get; set; }

    /// <summary>Browser description, to help recognise sessions.</summary>
    public string? UserAgent { get; set; }
}
