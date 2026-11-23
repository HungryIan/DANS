using System.Security.Claims;
using Dans.Api.Models;

namespace Dans.Api.Infrastructure;

public static class ClaimsPrincipalExtensions
{
    public static int? FindUserId(this ClaimsPrincipal principal) =>
        int.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    /// <summary>The signed-in user's id. Only call this from actions that require authentication.</summary>
    public static int GetUserId(this ClaimsPrincipal principal) =>
        principal.FindUserId() ?? throw new InvalidOperationException("The current request has no authenticated user.");

    public static UserRole GetRole(this ClaimsPrincipal principal) =>
        Enum.TryParse<UserRole>(principal.FindFirst(ClaimTypes.Role)?.Value, out var role) ? role : UserRole.Resident;
}
