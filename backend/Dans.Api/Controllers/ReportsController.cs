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

/// <summary>Emergency reports: residents submit them, officials and responders monitor and resolve them.</summary>
[Route("api/reports")]
[Authorize]
public class ReportsController(AppDbContext db, NotificationService notifier, AlertService alerts) : ApiControllerBase
{
    /// <summary>Submits a new emergency report. Officials are notified immediately.</summary>
    [HttpPost]
    public async Task<ActionResult<ReportDto>> Create(CreateReportRequest request)
    {
        var userId = CurrentUserId;
        if ((request.Latitude is null) != (request.Longitude is null))
            return Error(StatusCodes.Status400BadRequest, "Provide both latitude and longitude, or neither.");
        if (!await db.Barangays.AnyAsync(b => b.Id == request.BarangayId))
            return Error(StatusCodes.Status400BadRequest, "Please select a valid barangay.");

        // Simple protection against accidental double-submits and spam.
        var since = DateTime.UtcNow.AddMinutes(-10);
        if (await db.Reports.CountAsync(r => r.ReporterId == userId && r.CreatedAt >= since) >= 5)
            return Error(StatusCodes.Status429TooManyRequests,
                "You have sent several reports in the last few minutes. Please wait before sending another one, or call 911 if you need immediate help.");

        var report = new IncidentReport
        {
            ReporterId = userId,
            Type = request.Type!.Value,
            Severity = request.Severity!.Value,
            BarangayId = request.BarangayId!.Value,
            Location = request.Location.Trim(),
            Description = request.Description.Trim(),
            PeopleAffected = request.PeopleAffected,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
        };
        report.Updates.Add(new ReportUpdate { UserId = userId, Status = ReportStatus.Pending, Note = "Report submitted." });
        db.Reports.Add(report);
        await db.SaveChangesAsync();

        var dto = await LoadAsync(report.Id);
        await notifier.NotifyManagersAsync(
            $"New {dto.Type} report in {dto.BarangayName}",
            $"{dto.ReferenceNo} · {dto.Severity} · {dto.Location}: {Text.Truncate(dto.Description, 120)}",
            NotificationType.Report, $"/reports/{dto.Id}", exceptUserId: userId);
        await notifier.PushToStaffAsync(HubEvents.ReportChanged, dto);

        return CreatedAtAction(nameof(Get), new { id = dto.Id }, dto);
    }

    /// <summary>Reports submitted by the signed-in user.</summary>
    [HttpGet("mine")]
    public async Task<List<ReportDto>> GetMine()
    {
        var userId = CurrentUserId;
        return await db.Reports
            .Where(r => r.ReporterId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(Mappings.ToReportDto)
            .ToListAsync();
    }

    /// <summary>All reports, filtered and paged (staff only).</summary>
    [HttpGet]
    [Authorize(Roles = Roles.Staff)]
    public async Task<ActionResult<PagedResult<ReportDto>>> GetAll([FromQuery] ReportQuery query)
    {
        if (InvalidDateRange(query)) return DateRangeError();
        var filtered = ApplyFilters(db.Reports, query);
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 200);
        var total = await filtered.CountAsync();
        var items = await filtered
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(Mappings.ToReportDto)
            .ToListAsync();
        return new PagedResult<ReportDto>(items, total, page, pageSize);
    }

    /// <summary>Every report that matches the filters (up to 10,000), used for the CSV export of incident records.</summary>
    [HttpGet("export")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<List<ReportDto>>> Export([FromQuery] ReportQuery query)
    {
        if (InvalidDateRange(query)) return DateRangeError();
        return await ApplyFilters(db.Reports, query)
            .OrderByDescending(r => r.CreatedAt)
            .Take(10_000)
            .Select(Mappings.ToReportDto)
            .ToListAsync();
    }

    private static bool InvalidDateRange(ReportQuery query) => query.From > query.To;

    private ObjectResult DateRangeError() =>
        Error(StatusCodes.Status400BadRequest, "The start date must be on or before the end date.");

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ReportDetailDto>> Get(int id)
    {
        var report = await db.Reports.Where(r => r.Id == id).Select(Mappings.ToReportDto).FirstOrDefaultAsync();
        if (report is null) return Error(StatusCodes.Status404NotFound, "Report not found.");

        var userId = CurrentUserId;
        var role = CurrentRole;
        if (!Roles.IsStaff(role) && report.ReporterId != userId)
            return Error(StatusCodes.Status403Forbidden, "You can only view reports that you submitted.");

        var updates = await db.ReportUpdates
            .Where(u => u.ReportId == id)
            .OrderBy(u => u.CreatedAt).ThenBy(u => u.Id)
            .Select(u => new ReportUpdateDto(u.Id, u.Status, u.Note, u.User.FullName, u.User.Role, u.CreatedAt))
            .ToListAsync();

        var canManage = Roles.IsManager(role);
        var canUpdate = canManage || (Roles.IsStaff(role) && report.AssignedToId == userId);
        var hasActiveAlert = await alerts.HasActiveAlertForReportAsync(id);
        return new ReportDetailDto(report, updates, canUpdate, canManage, hasActiveAlert);
    }

    /// <summary>Changes the status of a report and/or adds a note to its timeline.</summary>
    [HttpPost("{id:int}/updates")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<ActionResult<ReportDetailDto>> AddUpdate(int id, AddReportUpdateRequest request)
    {
        var report = await db.Reports.Include(r => r.Barangay).FirstOrDefaultAsync(r => r.Id == id);
        if (report is null) return Error(StatusCodes.Status404NotFound, "Report not found.");

        var userId = CurrentUserId;
        var isManager = Roles.IsManager(CurrentRole);
        if (!isManager && report.AssignedToId != userId)
            return Error(StatusCodes.Status403Forbidden, "Only officials or the assigned responder can update this report.");

        var note = Text.NullIfBlank(request.Note);
        ReportStatus? newStatus = request.Status is { } requested && requested != report.Status ? requested : null;
        if (newStatus is null && note is null)
            return Error(StatusCodes.Status400BadRequest, "Choose a new status or write a note.");
        if (newStatus is { } target && !isManager)
        {
            if (target is not (ReportStatus.Responding or ReportStatus.Resolved))
                return Error(StatusCodes.Status403Forbidden, "Responders and volunteers can only mark a report as Responding or Resolved.");
            if (ReportStatuses.IsClosed(report.Status))
                return Error(StatusCodes.Status403Forbidden, "This report is already closed. Only officials can reopen it.");
        }

        var now = DateTime.UtcNow;
        if (newStatus is { } status)
        {
            report.Status = status;
            report.ClosedAt = ReportStatuses.IsClosed(status) ? now : null;
        }
        report.UpdatedAt = now;
        db.ReportUpdates.Add(new ReportUpdate { ReportId = id, UserId = userId, Status = newStatus, Note = note, CreatedAt = now });
        await db.SaveChangesAsync();

        var dto = await LoadAsync(id);
        if (newStatus is { } changed)
        {
            if (report.ReporterId != userId)
                await notifier.NotifyUsersAsync([report.ReporterId], $"Update on your report {dto.ReferenceNo}",
                    ReporterMessage(changed, note), NotificationType.Report, $"/reports/{id}");

            // Automatically warn residents of the affected barangay once officials confirm the emergency.
            if (changed == ReportStatus.Verified && request.NotifyResidents && !await alerts.HasActiveAlertForReportAsync(id))
                await alerts.IssueAsync(await BuildAreaAlertAsync(report, userId));

            // Closing a report ends the alerts that were issued for it.
            if (ReportStatuses.IsClosed(changed))
            {
                var type = report.Type.ToString().ToLowerInvariant();
                await alerts.LiftForReportAsync(id, changed == ReportStatus.Resolved
                    ? $"The {type} incident at {report.Location}, {report.Barangay.Name} has been resolved."
                    : $"The reported {type} incident at {report.Location}, {report.Barangay.Name} has been closed by officials.");
            }
        }

        await notifier.PushToStaffAsync(HubEvents.ReportChanged, dto);
        return await Get(id);
    }

    /// <summary>Assigns a responder, volunteer or official to a report (or removes the assignment).</summary>
    [HttpPut("{id:int}/assignment")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<ReportDetailDto>> Assign(int id, AssignReportRequest request)
    {
        var report = await db.Reports.FindAsync(id);
        if (report is null) return Error(StatusCodes.Status404NotFound, "Report not found.");
        if (report.AssignedToId == request.AssigneeId) return await Get(id);

        User? assignee = null;
        if (request.AssigneeId is int assigneeId)
        {
            assignee = await db.Users.FirstOrDefaultAsync(u => u.Id == assigneeId && u.IsActive);
            if (assignee is null || assignee.Role == UserRole.Resident)
                return Error(StatusCodes.Status400BadRequest, "Reports can only be assigned to active responders, volunteers or officials.");
        }

        var userId = CurrentUserId;
        report.AssignedToId = assignee?.Id;
        report.UpdatedAt = DateTime.UtcNow;
        db.ReportUpdates.Add(new ReportUpdate
        {
            ReportId = id,
            UserId = userId,
            Note = assignee is null ? "Assignment removed." : $"Assigned to {assignee.FullName} ({assignee.Role}).",
        });
        await db.SaveChangesAsync();

        var dto = await LoadAsync(id);
        if (assignee is not null && assignee.Id != userId)
            await notifier.NotifyUsersAsync([assignee.Id], $"New assignment: {dto.ReferenceNo}",
                $"{dto.Type} ({dto.Severity}) at {dto.Location}, {dto.BarangayName}. Open the report to respond and post updates.",
                NotificationType.Assignment, $"/reports/{id}");
        await notifier.PushToStaffAsync(HubEvents.ReportChanged, dto);

        return await Get(id);
    }

    private IQueryable<IncidentReport> ApplyFilters(IQueryable<IncidentReport> query, ReportQuery filter)
    {
        if (filter.ActiveOnly)
            query = query.Where(r => ReportStatuses.Active.Contains(r.Status));
        if (filter.Status is { } status)
            query = query.Where(r => r.Status == status);
        if (filter.Type is { } type)
            query = query.Where(r => r.Type == type);
        if (filter.BarangayId is { } barangayId)
            query = query.Where(r => r.BarangayId == barangayId);
        if (filter.From is { } from)
        {
            var fromUtc = from.UtcDateTime;
            query = query.Where(r => r.CreatedAt >= fromUtc);
        }
        if (filter.To is { } to)
        {
            var toUtc = to.UtcDateTime;
            query = query.Where(r => r.CreatedAt <= toUtc);
        }
        if (filter.AssignedToMe)
        {
            var userId = CurrentUserId;
            query = query.Where(r => r.AssignedToId == userId);
        }
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var pattern = Text.ContainsPattern(filter.Search.Trim());
            var reportId = Mappings.ParseReferenceNo(filter.Search);
            query = query.Where(r =>
                (reportId != null && r.Id == reportId) ||
                EF.Functions.Like(r.Location, pattern, Text.LikeEscape) ||
                EF.Functions.Like(r.Description, pattern, Text.LikeEscape) ||
                EF.Functions.Like(r.Reporter.FullName, pattern, Text.LikeEscape));
        }
        return query;
    }

    private Task<ReportDto> LoadAsync(int id) =>
        db.Reports.Where(r => r.Id == id).Select(Mappings.ToReportDto).FirstAsync();

    private async Task<Alert> BuildAreaAlertAsync(IncidentReport report, int issuedById)
    {
        var duringTips = await db.SafetyGuides
            .Where(g => g.Type == report.Type)
            .Select(g => g.DuringTips)
            .FirstOrDefaultAsync();
        var type = report.Type.ToString();

        return new Alert
        {
            Title = $"{type} emergency in {report.Barangay.Name}",
            Message = $"Local officials have verified a {type.ToLowerInvariant()} emergency at {report.Location}, " +
                      $"Barangay {report.Barangay.Name}. Stay away from the area, stay alert, and follow instructions from responders.",
            Instructions = duringTips,
            Type = report.Type,
            Severity = report.Severity,
            IssuedById = issuedById,
            ReportId = report.Id,
            Barangays = [report.Barangay],
        };
    }

    private static string ReporterMessage(ReportStatus status, string? note)
    {
        var message = status switch
        {
            ReportStatus.Verified => "Local officials have verified your report and are coordinating a response.",
            ReportStatus.Responding => "Responders are now attending to your report.",
            ReportStatus.Resolved => "Your report has been marked as resolved. Thank you for helping keep the community safe.",
            ReportStatus.Dismissed => "Your report was reviewed and closed by local officials.",
            _ => "Your report has been reopened for review.",
        };
        return note is null ? message : $"{message} Note: {note}";
    }
}
