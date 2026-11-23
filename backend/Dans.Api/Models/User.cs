namespace Dans.Api.Models;

public class User
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;

    /// <summary>Stored in lower case; used as the login name.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>Philippine mobile number in 09XXXXXXXXX format.</summary>
    public string PhoneNumber { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Resident;

    /// <summary>The barangay the user lives in. Alerts for this barangay are pushed to the user.</summary>
    public int? BarangayId { get; set; }
    public Barangay? Barangay { get; set; }

    /// <summary>Purok, street or house details inside the barangay.</summary>
    public string? Address { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Wrong passwords entered since the last successful sign-in (used for account lockout).</summary>
    public int FailedLoginCount { get; set; }

    /// <summary>While set to a future time, sign-in is refused (too many wrong passwords).</summary>
    public DateTime? LockoutEndsAt { get; set; }

    /// <summary>When the user agreed to the privacy notice (Data Privacy Act of 2012) while registering.
    /// Empty for accounts created by the system (the first administrator and demo accounts).</summary>
    public DateTime? PrivacyConsentAt { get; set; }
}
