using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Controllers;

/// <summary>The signed-in user's notification inbox.</summary>
[Route("api/notifications")]
[Authorize]
public class NotificationsController(AppDbContext db) : ApiControllerBase
{
    [HttpGet]
    public async Task<List<NotificationDto>> Get([FromQuery] bool unreadOnly = false, [FromQuery] int limit = 50)
    {
        var userId = CurrentUserId;
        var query = db.Notifications.Where(n => n.UserId == userId);
        if (unreadOnly)
            query = query.Where(n => !n.IsRead);

        return await query
            .OrderByDescending(n => n.CreatedAt).ThenByDescending(n => n.Id)
            .Take(Math.Clamp(limit, 1, 200))
            .Select(n => new NotificationDto(n.Id, n.Title, n.Message, n.Type, n.Link, n.IsRead, n.CreatedAt))
            .ToListAsync();
    }

    [HttpGet("unread-count")]
    public async Task<UnreadCountDto> UnreadCount()
    {
        var userId = CurrentUserId;
        return new UnreadCountDto(await db.Notifications.CountAsync(n => n.UserId == userId && !n.IsRead));
    }

    [HttpPost("{id:int}/read")]
    public async Task<IActionResult> MarkRead(int id)
    {
        var userId = CurrentUserId;
        var updated = await db.Notifications
            .Where(n => n.Id == id && n.UserId == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));
        if (updated == 0) return Error(StatusCodes.Status404NotFound, "Notification not found.");
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var userId = CurrentUserId;
        await db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));
        return NoContent();
    }
}
