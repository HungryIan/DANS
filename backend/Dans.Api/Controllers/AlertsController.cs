using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Dans.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Controllers;

[Route("api/alerts")]
public class AlertsController(AppDbContext db, AlertService alerts) : ApiControllerBase
{
    /// <summary>Lists alerts. Anyone can read them, even without signing in.</summary>
    /// <param name="status">"active" (default), "past" or "all".</param>
    /// <param name="barangayId">Only alerts that cover this barangay (including municipality-wide alerts).</param>
    /// <param name="limit">Maximum number of alerts to return.</param>
    [HttpGet]
    public async Task<List<AlertDto>> GetAlerts(
        [FromQuery] string status = "active", [FromQuery] int? barangayId = null, [FromQuery] int limit = 100)
    {
        var now = DateTime.UtcNow;
        var mode = status.ToLowerInvariant();
        var query = mode switch
        {
            "past" => db.Alerts.Where(a => a.LiftedAt != null || (a.ExpiresAt != null && a.ExpiresAt <= now)),
            "all" => db.Alerts.AsQueryable(),
            _ => alerts.ActiveAlerts(now),
        };

        if (barangayId is int id)
            query = query.Where(a => !a.Barangays.Any() || a.Barangays.Any(b => b.Id == id));

        var ordered = mode is "past" or "all"
            ? query.OrderByDescending(a => a.IssuedAt)
            : query.OrderByDescending(a => a.Severity).ThenByDescending(a => a.IssuedAt);

        return await ordered.Take(Math.Clamp(limit, 1, 200)).Select(Mappings.ToAlertDto(now)).ToListAsync();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AlertDto>> Get(int id)
    {
        var alert = await alerts.GetAsync(id);
        if (alert is null) return Error(StatusCodes.Status404NotFound, "Alert not found.");
        return alert;
    }

    /// <summary>Issues an alert and notifies residents of the target barangays in real time.</summary>
    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<AlertDto>> Create(CreateAlertRequest request)
    {
        if (request.ExpiresAt is DateTime expiresAt && expiresAt.ToUniversalTime() <= DateTime.UtcNow)
            return Error(StatusCodes.Status400BadRequest, "The expiry time must be in the future.");

        var barangayIds = request.BarangayIds.Distinct().ToList();
        var barangays = await db.Barangays.Where(b => barangayIds.Contains(b.Id)).ToListAsync();
        if (barangays.Count != barangayIds.Count)
            return Error(StatusCodes.Status400BadRequest, "One or more selected barangays do not exist.");
        if (request.ReportId is int reportId && !await db.Reports.AnyAsync(r => r.Id == reportId))
            return Error(StatusCodes.Status400BadRequest, "The linked incident report does not exist.");

        var dto = await alerts.IssueAsync(new Alert
        {
            Title = request.Title.Trim(),
            Message = request.Message.Trim(),
            Instructions = Text.NullIfBlank(request.Instructions),
            Type = request.Type!.Value,
            Severity = request.Severity!.Value,
            IssuedById = CurrentUserId,
            ExpiresAt = request.ExpiresAt?.ToUniversalTime(),
            ReportId = request.ReportId,
            Barangays = barangays,
        });

        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    /// <summary>Ends an active alert ("all clear") and tells the affected residents.</summary>
    [HttpPost("{id:int}/lift")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<AlertDto>> Lift(int id)
    {
        var alert = await db.Alerts.Include(a => a.Barangays).FirstOrDefaultAsync(a => a.Id == id);
        if (alert is null) return Error(StatusCodes.Status404NotFound, "Alert not found.");
        if (alert.LiftedAt != null || alert.ExpiresAt <= DateTime.UtcNow)
            return Error(StatusCodes.Status400BadRequest, "This alert is no longer active.");

        await alerts.LiftAsync(alert, "Local officials have lifted this alert. Continue to follow official announcements.");
        return (await alerts.GetAsync(id))!;
    }
}
