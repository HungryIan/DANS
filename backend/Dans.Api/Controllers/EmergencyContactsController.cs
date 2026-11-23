using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Controllers;

/// <summary>Emergency hotlines. Public; editable by officials.</summary>
[Route("api/emergency-contacts")]
public class EmergencyContactsController(AppDbContext db) : ApiControllerBase
{
    [HttpGet]
    public async Task<List<EmergencyContactDto>> GetAll() =>
        (await db.EmergencyContacts.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync())
            .Select(c => c.ToDto())
            .ToList();

    [HttpPost]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<EmergencyContactDto>> Create(SaveEmergencyContactRequest request)
    {
        var contact = new EmergencyContact();
        Apply(contact, request);
        db.EmergencyContacts.Add(contact);
        await db.SaveChangesAsync();
        return contact.ToDto();
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<ActionResult<EmergencyContactDto>> Update(int id, SaveEmergencyContactRequest request)
    {
        var contact = await db.EmergencyContacts.FindAsync(id);
        if (contact is null) return Error(StatusCodes.Status404NotFound, "Contact not found.");

        Apply(contact, request);
        await db.SaveChangesAsync();
        return contact.ToDto();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = Roles.Managers)]
    public async Task<IActionResult> Delete(int id)
    {
        var contact = await db.EmergencyContacts.FindAsync(id);
        if (contact is null) return Error(StatusCodes.Status404NotFound, "Contact not found.");

        db.EmergencyContacts.Remove(contact);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static void Apply(EmergencyContact contact, SaveEmergencyContactRequest request)
    {
        contact.Name = request.Name.Trim();
        contact.Number = request.Number.Trim();
        contact.Description = Text.NullIfBlank(request.Description);
        contact.SortOrder = request.SortOrder;
    }
}
