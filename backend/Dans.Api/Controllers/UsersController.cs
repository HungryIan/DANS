using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Hubs;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Dans.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Controllers;

/// <summary>User management for community administrators.</summary>
[Route("api/users")]
[Authorize]
public class UsersController(
    AppDbContext db,
    AuthSessionService sessions,
    NotificationService notifier,
    ILogger<UsersController> logger) : ApiControllerBase
{
    [HttpGet]
    [Authorize(Roles = Roles.Admin)]
    public async Task<PagedResult<UserDto>> GetUsers(
        [FromQuery] string? search, [FromQuery] UserRole? role, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var query = db.Users.AsQueryable();
        if (role is not null)
            query = query.Where(u => u.Role == role);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = Text.ContainsPattern(search.Trim());
            query = query.Where(u =>
                EF.Functions.Like(u.FullName, pattern, Text.LikeEscape) ||
                EF.Functions.Like(u.Email, pattern, Text.LikeEscape) ||
                EF.Functions.Like(u.PhoneNumber, pattern, Text.LikeEscape));
        }

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(u => u.Role).ThenBy(u => u.FullName)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(Mappings.ToUserDto)
            .ToListAsync();
        return new PagedResult<UserDto>(items, total, page, pageSize);
    }

    /// <summary>Staff members that incident reports can be assigned to.</summary>
    [HttpGet("assignable")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<List<AssignableUserDto>> GetAssignable() =>
        await db.Users
            .Where(u => u.IsActive && u.Role != UserRole.Resident)
            .OrderBy(u => u.Role == UserRole.Responder ? 0 : u.Role == UserRole.Volunteer ? 1 : 2)
            .ThenBy(u => u.FullName)
            .Select(u => new AssignableUserDto(u.Id, u.FullName, u.Role, u.Barangay != null ? u.Barangay.Name : null))
            .ToListAsync();

    [HttpPut("{id:int}/role")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserDto>> UpdateRole(int id, UpdateRoleRequest request)
    {
        if (id == CurrentUserId)
            return Error(StatusCodes.Status400BadRequest, "You cannot change your own role.");

        var user = await db.Users.FindAsync(id);
        if (user is null) return Error(StatusCodes.Status404NotFound, "User not found.");

        var previousRole = user.Role;
        if (previousRole != request.Role!.Value)
        {
            user.Role = request.Role.Value;
            await db.SaveChangesAsync();

            // The user must sign in again so their new permissions apply everywhere at once.
            await sessions.RevokeAllAsync(id);
            if (user.Role == UserRole.Resident)
                await ReleaseAssignmentsAsync(user, "is no longer a staff member");
            logger.LogInformation("Admin {AdminId} changed the role of user {UserId} from {OldRole} to {NewRole}",
                CurrentUserId, id, previousRole, user.Role);
        }
        return await db.Users.Where(u => u.Id == id).Select(Mappings.ToUserDto).FirstAsync();
    }

    [HttpPut("{id:int}/status")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<UserDto>> UpdateStatus(int id, UpdateUserStatusRequest request)
    {
        if (id == CurrentUserId)
            return Error(StatusCodes.Status400BadRequest, "You cannot deactivate your own account.");

        var user = await db.Users.FindAsync(id);
        if (user is null) return Error(StatusCodes.Status404NotFound, "User not found.");

        user.IsActive = request.IsActive;
        await db.SaveChangesAsync();

        if (!user.IsActive)
        {
            await sessions.RevokeAllAsync(id);
            await ReleaseAssignmentsAsync(user, "was deactivated");
        }
        logger.LogInformation("Admin {AdminId} {Action} user {UserId}", CurrentUserId, user.IsActive ? "reactivated" : "deactivated", id);
        return await db.Users.Where(u => u.Id == id).Select(Mappings.ToUserDto).FirstAsync();
    }

    /// <summary>
    /// Only officials or the assigned person can update a report, so open reports assigned to someone who was
    /// deactivated or is no longer staff would be stuck. Unassign them (recorded in each report's timeline)
    /// and ask the officials to assign someone else.
    /// </summary>
    private async Task ReleaseAssignmentsAsync(User user, string reason)
    {
        var reports = await db.Reports
            .Where(r => r.AssignedToId == user.Id && ReportStatuses.Active.Contains(r.Status))
            .ToListAsync();
        if (reports.Count == 0) return;

        var now = DateTime.UtcNow;
        foreach (var report in reports)
        {
            report.AssignedToId = null;
            report.UpdatedAt = now;
            db.ReportUpdates.Add(new ReportUpdate
            {
                ReportId = report.Id,
                UserId = CurrentUserId,
                Note = $"Assignment removed: {user.FullName} {reason}.",
                CreatedAt = now,
            });
        }
        await db.SaveChangesAsync();

        var ids = reports.Select(r => r.Id).ToList();
        var changed = await db.Reports.Where(r => ids.Contains(r.Id)).Select(Mappings.ToReportDto).ToListAsync();
        foreach (var dto in changed)
            await notifier.PushToStaffAsync(HubEvents.ReportChanged, dto);
        await notifier.NotifyManagersAsync(
            $"{changed.Count} open report(s) need a new responder",
            $"{user.FullName} {reason}, so these reports were unassigned: {string.Join(", ", changed.Select(d => d.ReferenceNo))}.",
            NotificationType.Assignment, changed.Count == 1 ? $"/reports/{changed[0].Id}" : "/monitor");
        logger.LogInformation("Unassigned {Count} open report(s) from user {UserId} who {Reason}", changed.Count, user.Id, reason);
    }
}
