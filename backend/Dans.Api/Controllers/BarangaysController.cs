using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Controllers;

[Route("api/barangays")]
public class BarangaysController(AppDbContext db) : ApiControllerBase
{
    [HttpGet]
    public async Task<List<BarangayDto>> GetAll() =>
        await db.Barangays.OrderBy(b => b.Name).Select(b => new BarangayDto(b.Id, b.Name)).ToListAsync();

    /// <summary>Barangays with the number of registered residents, evacuation centers and active incidents.</summary>
    [HttpGet("stats")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<List<BarangayStatsDto>> GetStats() =>
        await db.Barangays
            .OrderBy(b => b.Name)
            .Select(b => new BarangayStatsDto(
                b.Id,
                b.Name,
                db.Users.Count(u => u.BarangayId == b.Id && u.IsActive),
                db.EvacuationCenters.Count(c => c.BarangayId == b.Id),
                db.Reports.Count(r => r.BarangayId == b.Id && ReportStatuses.Active.Contains(r.Status))))
            .ToListAsync();

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<BarangayDto>> Create(SaveBarangayRequest request)
    {
        var name = request.Name.Trim();
        if (await NameTakenAsync(name, exceptId: null))
            return Error(StatusCodes.Status409Conflict, $"Barangay \"{name}\" already exists.");

        var barangay = new Barangay { Name = name };
        db.Barangays.Add(barangay);
        await db.SaveChangesAsync();
        return new BarangayDto(barangay.Id, barangay.Name);
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<BarangayDto>> Update(int id, SaveBarangayRequest request)
    {
        var barangay = await db.Barangays.FindAsync(id);
        if (barangay is null) return Error(StatusCodes.Status404NotFound, "Barangay not found.");

        var name = request.Name.Trim();
        if (await NameTakenAsync(name, exceptId: id))
            return Error(StatusCodes.Status409Conflict, $"Barangay \"{name}\" already exists.");

        barangay.Name = name;
        await db.SaveChangesAsync();
        return new BarangayDto(barangay.Id, barangay.Name);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(int id)
    {
        var barangay = await db.Barangays.FindAsync(id);
        if (barangay is null) return Error(StatusCodes.Status404NotFound, "Barangay not found.");

        var inUse = await db.Users.AnyAsync(u => u.BarangayId == id)
            || await db.Reports.AnyAsync(r => r.BarangayId == id)
            || await db.EvacuationCenters.AnyAsync(c => c.BarangayId == id)
            || await db.Alerts.AnyAsync(a => a.Barangays.Any(b => b.Id == id));
        if (inUse)
            return Error(StatusCodes.Status409Conflict,
                "This barangay is linked to users, reports, alerts or evacuation centers, so it cannot be deleted.");

        db.Barangays.Remove(barangay);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private Task<bool> NameTakenAsync(string name, int? exceptId)
    {
        var lower = name.ToLower();
        return db.Barangays.AnyAsync(b => b.Name.ToLower() == lower && b.Id != exceptId);
    }
}
