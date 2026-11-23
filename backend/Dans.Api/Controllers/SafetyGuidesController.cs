using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Controllers;

/// <summary>Safety instructions for each type of disaster. Public; editable by officials.</summary>
[Route("api/safety-guides")]
public class SafetyGuidesController(AppDbContext db) : ApiControllerBase
{
    [HttpGet]
    public async Task<List<SafetyGuideDto>> GetAll()
    {
        var guides = await db.SafetyGuides.OrderBy(g => g.Type).ThenBy(g => g.Title).ToListAsync();
        return guides.Select(SafetyGuideDto.From).ToList();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<SafetyGuideDto>> Get(int id)
    {
        var guide = await db.SafetyGuides.FindAsync(id);
        if (guide is null) return Error(StatusCodes.Status404NotFound, "Safety guide not found.");
        return SafetyGuideDto.From(guide);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<SafetyGuideDto>> Create(SaveSafetyGuideRequest request)
    {
        if (Validate(request) is { } error)
            return Error(StatusCodes.Status400BadRequest, error);

        var guide = new SafetyGuide();
        Apply(guide, request);
        db.SafetyGuides.Add(guide);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = guide.Id }, SafetyGuideDto.From(guide));
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<SafetyGuideDto>> Update(int id, SaveSafetyGuideRequest request)
    {
        var guide = await db.SafetyGuides.FindAsync(id);
        if (guide is null) return Error(StatusCodes.Status404NotFound, "Safety guide not found.");
        if (Validate(request) is { } error)
            return Error(StatusCodes.Status400BadRequest, error);

        Apply(guide, request);
        await db.SaveChangesAsync();
        return SafetyGuideDto.From(guide);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(int id)
    {
        var guide = await db.SafetyGuides.FindAsync(id);
        if (guide is null) return Error(StatusCodes.Status404NotFound, "Safety guide not found.");

        db.SafetyGuides.Remove(guide);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private const int MaxTipsPerPhase = 30;
    private const int MaxTipLength = 500;

    private static string? Validate(SaveSafetyGuideRequest request)
    {
        List<string>[] phases = [request.Before, request.During, request.After];
        if (Text.JoinLines(phases.SelectMany(p => p)).Length == 0)
            return "Add at least one safety tip.";
        if (phases.Any(p => p.Count > MaxTipsPerPhase))
            return $"Each part of a guide can have at most {MaxTipsPerPhase} tips.";
        if (phases.SelectMany(p => p).Any(tip => tip.Trim().Length > MaxTipLength))
            return $"Each tip can be at most {MaxTipLength} characters long.";
        return null;
    }

    private static void Apply(SafetyGuide guide, SaveSafetyGuideRequest request)
    {
        guide.Type = request.Type!.Value;
        guide.Title = request.Title.Trim();
        guide.Summary = request.Summary.Trim();
        guide.BeforeTips = Text.JoinLines(request.Before);
        guide.DuringTips = Text.JoinLines(request.During);
        guide.AfterTips = Text.JoinLines(request.After);
        guide.UpdatedAt = DateTime.UtcNow;
    }
}
