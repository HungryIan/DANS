using System.ComponentModel.DataAnnotations;
using Dans.Api.Infrastructure;
using Dans.Api.Models;

namespace Dans.Api.Dtos;

public class RegisterRequest
{
    [Required, StringLength(100, MinimumLength = 2)]
    public string FullName { get; set; } = string.Empty;

    [Required, EmailAddress, StringLength(150)]
    public string Email { get; set; } = string.Empty;

    [Required, RegularExpression(Text.PhonePattern, ErrorMessage = Text.PhoneMessage)]
    public string PhoneNumber { get; set; } = string.Empty;

    [Required, StrongPassword]
    public string Password { get; set; } = string.Empty;

    [Required(ErrorMessage = "Please select your barangay.")]
    public int? BarangayId { get; set; }

    [StringLength(200)]
    public string? Address { get; set; }

    /// <summary>The user must agree to the privacy notice before personal data is stored (RA 10173).</summary>
    [MustBeTrue(ErrorMessage = "Please read and agree to the privacy notice to create an account.")]
    public bool AcceptPrivacyNotice { get; set; }
}

public class LoginRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}

public class UpdateProfileRequest
{
    [Required, StringLength(100, MinimumLength = 2)]
    public string FullName { get; set; } = string.Empty;

    [Required, RegularExpression(Text.PhonePattern, ErrorMessage = Text.PhoneMessage)]
    public string PhoneNumber { get; set; } = string.Empty;

    public int? BarangayId { get; set; }

    [StringLength(200)]
    public string? Address { get; set; }
}

public class ChangePasswordRequest
{
    [Required]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required, StrongPassword]
    public string NewPassword { get; set; } = string.Empty;
}

public record UserDto(
    int Id,
    string FullName,
    string Email,
    string PhoneNumber,
    UserRole Role,
    int? BarangayId,
    string? BarangayName,
    string? Address,
    bool IsActive,
    DateTime CreatedAt);

/// <summary>Returned after signing in. The token itself is only in the HttpOnly cookie, never in the body.</summary>
public record AuthResponse(DateTime ExpiresAt, UserDto User);

/// <summary>Who is signed in (User is null for visitors).</summary>
public record SessionResponse(UserDto? User);
