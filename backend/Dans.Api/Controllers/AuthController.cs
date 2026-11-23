using Dans.Api.Data;
using Dans.Api.Dtos;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Dans.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Dans.Api.Controllers;

[Route("api/auth")]
public class AuthController(
    AppDbContext db,
    AuthSessionService sessions,
    IPasswordHasher<User> hasher,
    ILogger<AuthController> logger) : ApiControllerBase
{
    /// <summary>Wrong passwords allowed before the account is locked.</summary>
    public const int MaxFailedAttempts = 5;
    public static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    /// <summary>Hash used to spend the same time on unknown emails, so response times don't reveal which emails exist.</summary>
    private static string? _dummyHash;

    /// <summary>Who is signed in. Always 200, so visitors don't produce errors.</summary>
    [HttpGet("session")]
    [AllowAnonymous]
    public async Task<SessionResponse> Session()
    {
        var userId = User.FindUserId();
        return new SessionResponse(userId is null ? null : await LoadUserAsync(userId.Value));
    }

    /// <summary>Creates a resident account and signs it in.</summary>
    [HttpPost("register")]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var email = Text.NormalizeEmail(request.Email);
        if (await db.Users.AnyAsync(u => u.Email == email))
            return Error(StatusCodes.Status409Conflict, "An account with this email address already exists.");
        if (!await db.Barangays.AnyAsync(b => b.Id == request.BarangayId))
            return Error(StatusCodes.Status400BadRequest, "Please select a valid barangay.");

        var user = new User
        {
            FullName = request.FullName.Trim(),
            Email = email,
            PhoneNumber = Text.NormalizePhone(request.PhoneNumber),
            BarangayId = request.BarangayId,
            Address = Text.NullIfBlank(request.Address),
            Role = UserRole.Resident,
            PrivacyConsentAt = DateTime.UtcNow,
        };
        user.PasswordHash = hasher.HashPassword(user, request.Password);
        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Two registrations with the same email at the same moment: the unique index rejects the second one.
            db.ChangeTracker.Clear();
            if (await db.Users.AnyAsync(u => u.Email == email))
                return Error(StatusCodes.Status409Conflict, "An account with this email address already exists.");
            throw;
        }

        var expiresAt = await sessions.SignInAsync(HttpContext, user);
        return new AuthResponse(expiresAt, (await LoadUserAsync(user.Id))!);
    }

    [HttpPost("login")]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var now = DateTime.UtcNow;
        var email = Text.NormalizeEmail(request.Email);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);

        if (user is null)
        {
            _dummyHash ??= hasher.HashPassword(new User(), Guid.NewGuid().ToString());
            hasher.VerifyHashedPassword(new User(), _dummyHash, request.Password);
            return Error(StatusCodes.Status401Unauthorized, "Invalid email or password.");
        }

        if (user.LockoutEndsAt > now)
        {
            var minutes = (int)Math.Ceiling((user.LockoutEndsAt.Value - now).TotalMinutes);
            return Error(StatusCodes.Status423Locked,
                $"Too many wrong passwords. For your security this account is locked for {minutes} more minute(s).");
        }

        var result = hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (result == PasswordVerificationResult.Failed)
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= MaxFailedAttempts)
            {
                user.LockoutEndsAt = now + LockoutDuration;
                user.FailedLoginCount = 0;
                logger.LogWarning("User {UserId} locked out for {Minutes} minutes after repeated failed sign-ins from {Ip}",
                    user.Id, LockoutDuration.TotalMinutes, HttpContext.Connection.RemoteIpAddress);
            }
            await db.SaveChangesAsync();
            return Error(StatusCodes.Status401Unauthorized, "Invalid email or password.");
        }

        if (!user.IsActive)
            return Error(StatusCodes.Status403Forbidden, "Your account has been deactivated. Please contact the administrator.");

        user.FailedLoginCount = 0;
        user.LockoutEndsAt = null;
        if (result == PasswordVerificationResult.SuccessRehashNeeded)
            user.PasswordHash = hasher.HashPassword(user, request.Password);
        await db.SaveChangesAsync();

        var expiresAt = await sessions.SignInAsync(HttpContext, user);
        return new AuthResponse(expiresAt, (await LoadUserAsync(user.Id))!);
    }

    /// <summary>Ends the current session on the server and removes the cookie.</summary>
    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout()
    {
        await sessions.SignOutAsync(HttpContext);
        return NoContent();
    }

    /// <summary>Signs the user out on every device (e.g. after losing a phone).</summary>
    [Authorize]
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutEverywhere()
    {
        await sessions.RevokeAllAsync(CurrentUserId);
        AuthCookie.Delete(Response);
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await LoadUserAsync(CurrentUserId);
        if (user is null) return Error(StatusCodes.Status404NotFound, "Account not found.");
        return user;
    }

    [Authorize]
    [HttpPut("me")]
    public async Task<ActionResult<UserDto>> UpdateProfile(UpdateProfileRequest request)
    {
        var user = await db.Users.FindAsync(CurrentUserId);
        if (user is null) return Error(StatusCodes.Status404NotFound, "Account not found.");
        if (request.BarangayId is null && user.Role == UserRole.Resident)
            return Error(StatusCodes.Status400BadRequest, "Please select your barangay so you receive alerts for your area.");
        if (request.BarangayId is int barangayId && !await db.Barangays.AnyAsync(b => b.Id == barangayId))
            return Error(StatusCodes.Status400BadRequest, "Please select a valid barangay.");

        user.FullName = request.FullName.Trim();
        user.PhoneNumber = Text.NormalizePhone(request.PhoneNumber);
        user.BarangayId = request.BarangayId;
        user.Address = Text.NullIfBlank(request.Address);
        await db.SaveChangesAsync();

        return (await LoadUserAsync(user.Id))!;
    }

    /// <summary>Changes the password and signs out every other device.</summary>
    [Authorize]
    [HttpPost("me/password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var user = await db.Users.FindAsync(CurrentUserId);
        if (user is null) return Error(StatusCodes.Status404NotFound, "Account not found.");
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
            return Error(StatusCodes.Status400BadRequest, "Your current password is incorrect.");
        if (request.NewPassword == request.CurrentPassword)
            return Error(StatusCodes.Status400BadRequest, "The new password must be different from the current one.");

        user.PasswordHash = hasher.HashPassword(user, request.NewPassword);
        await db.SaveChangesAsync();
        await sessions.RevokeAllAsync(user.Id, exceptSessionId: User.FindFirst(AuthClaims.SessionId)?.Value);
        return NoContent();
    }

    private Task<UserDto?> LoadUserAsync(int id) =>
        db.Users.Where(u => u.Id == id).Select(Mappings.ToUserDto).FirstOrDefaultAsync();
}
