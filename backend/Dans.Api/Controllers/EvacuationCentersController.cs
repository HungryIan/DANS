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

[Route("api/evacuation-centers")]
public class EvacuationCentersController(AppDbContext db, NotificationService notifier) : ApiControllerBase
{
    /// <summary>Lists evacuation centers (open ones first). Public.</summary>
    [HttpGet]
    public async Task<List<EvacuationCenterDto>> GetAll([FromQuery] int? barangayId, [FromQuery] CenterStatus? status)
    {
        var query = db.EvacuationCenters.AsQueryable();
        if (barangayId is int id)
            query = query.Where(c => c.BarangayId == id);
        if (status is CenterStatus s)
            query = query.Where(c => c.Status == s);

        return await query
            .OrderBy(c => c.Status).ThenBy(c => c.Barangay.Name).ThenBy(c => c.Name)
            .Select(Mappings.ToCenterDto)
            .ToListAsync();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<EvacuationCenterDto>> Get(int id)
    {
        var center = await db.EvacuationCenters.Where(c => c.Id == id).Select(Mappings.ToCenterDto).FirstOrDefaultAsync();
        if (center is null) return Error(StatusCodes.Status404NotFound, "Evacuation center not found.");
        return center;
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<EvacuationCenterDto>> Create(SaveEvacuationCenterRequest request)
    {
        if (await ValidateAsync(request) is { } error)
            return Error(StatusCodes.Status400BadRequest, error);

        var center = new EvacuationCenter();
        Apply(center, request);
        MarkFullWhenAtCapacity(center);
        db.EvacuationCenters.Add(center);
        await db.SaveChangesAsync();

        await AfterChangeAsync(center, wasClosed: true);
        var dto = await LoadAsync(center.Id);
        return CreatedAtAction(nameof(Get), new { id = center.Id }, dto);
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<EvacuationCenterDto>> Update(int id, SaveEvacuationCenterRequest request)
    {
        var center = await db.EvacuationCenters.FindAsync(id);
        if (center is null) return Error(StatusCodes.Status404NotFound, "Evacuation center not found.");
        if (await ValidateAsync(request) is { } error)
            return Error(StatusCodes.Status400BadRequest, error);

        var wasClosed = center.Status == CenterStatus.Closed;
        Apply(center, request);
        MarkFullWhenAtCapacity(center);
        await db.SaveChangesAsync();

        await AfterChangeAsync(center, wasClosed);
        return await LoadAsync(id);
    }

    /// <summary>Quick update of the number of evacuees, used by staff in the field.</summary>
    [HttpPatch("{id:int}/occupancy")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<ActionResult<EvacuationCenterDto>> UpdateOccupancy(int id, UpdateOccupancyRequest request)
    {
        var center = await db.EvacuationCenters.FindAsync(id);
        if (center is null) return Error(StatusCodes.Status404NotFound, "Evacuation center not found.");

        var newStatus = request.Status ?? center.Status;
        if (newStatus == CenterStatus.Closed && request.CurrentOccupancy > 0)
            return Error(StatusCodes.Status400BadRequest, ClosedWithEvacueesMessage);

        var wasClosed = center.Status == CenterStatus.Closed;
        center.CurrentOccupancy = request.CurrentOccupancy;
        center.Status = newStatus;
        // Without an explicit status, a full center that has space again re-opens automatically.
        if (request.Status is null && center.Status == CenterStatus.Full && center.CurrentOccupancy < center.Capacity)
            center.Status = CenterStatus.Open;
        MarkFullWhenAtCapacity(center);
        center.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await AfterChangeAsync(center, wasClosed);
        return await LoadAsync(id);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(int id)
    {
        var center = await db.EvacuationCenters.FindAsync(id);
        if (center is null) return Error(StatusCodes.Status404NotFound, "Evacuation center not found.");

        db.EvacuationCenters.Remove(center);
        await db.SaveChangesAsync();
        await notifier.BroadcastAsync(HubEvents.CentersChanged);
        return NoContent();
    }

    private const string ClosedWithEvacueesMessage =
        "A closed evacuation center cannot have evacuees. Set the number of evacuees to 0, or mark the center Open or Full.";

    private async Task<string?> ValidateAsync(SaveEvacuationCenterRequest request)
    {
        if ((request.Latitude is null) != (request.Longitude is null))
            return "Provide both latitude and longitude, or neither.";
        if (request.Status == CenterStatus.Closed && request.CurrentOccupancy > 0)
            return ClosedWithEvacueesMessage;
        if (!await db.Barangays.AnyAsync(b => b.Id == request.BarangayId))
            return "Please select a valid barangay.";
        return null;
    }

    private static void Apply(EvacuationCenter center, SaveEvacuationCenterRequest request)
    {
        center.Name = request.Name.Trim();
        center.BarangayId = request.BarangayId!.Value;
        center.Address = request.Address.Trim();
        center.Capacity = request.Capacity;
        center.CurrentOccupancy = request.CurrentOccupancy;
        center.Status = request.Status!.Value;
        center.ContactPerson = Text.NullIfBlank(request.ContactPerson);
        center.ContactNumber = Text.NullIfBlank(request.ContactNumber);
        center.Facilities = Text.NullIfBlank(request.Facilities);
        center.Latitude = request.Latitude;
        center.Longitude = request.Longitude;
        center.UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>An open center that has reached its capacity is shown as Full, so residents go elsewhere.</summary>
    private static void MarkFullWhenAtCapacity(EvacuationCenter center)
    {
        if (center.Status == CenterStatus.Open && center.CurrentOccupancy >= center.Capacity)
            center.Status = CenterStatus.Full;
    }

    /// <summary>Refreshes every open map/list and, when a center is activated, tells residents of its barangay.</summary>
    private async Task AfterChangeAsync(EvacuationCenter center, bool wasClosed)
    {
        if (wasClosed && center.Status != CenterStatus.Closed)
        {
            var barangay = await db.Barangays.Where(b => b.Id == center.BarangayId).Select(b => b.Name).FirstAsync();
            await notifier.NotifyAreaAsync([center.BarangayId],
                $"Evacuation center open: {center.Name}",
                $"{center.Name} ({center.Address}, {barangay}) is now open for evacuees.",
                NotificationType.Evacuation, "/evacuation-centers");
        }
        await notifier.BroadcastAsync(HubEvents.CentersChanged);
    }

    private Task<EvacuationCenterDto> LoadAsync(int id) =>
        db.EvacuationCenters.Where(c => c.Id == id).Select(Mappings.ToCenterDto).FirstAsync();
}
