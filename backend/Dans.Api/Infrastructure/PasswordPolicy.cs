using System.ComponentModel.DataAnnotations;

namespace Dans.Api.Infrastructure;

/// <summary>Password rules used for registration, password changes and the first administrator.</summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;
    public const int MaxLength = 128;
    public const string Requirements = "Use at least 8 characters, including an uppercase letter, a lowercase letter and a number.";

    /// <summary>Passwords that attackers try first. Matching is case-insensitive.</summary>
    private static readonly HashSet<string> CommonPasswords = new(StringComparer.OrdinalIgnoreCase)
    {
        "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword1", "password1!",
        "qwerty123", "qwerty1234", "qwertyuiop1", "admin123", "admin@123", "admin1234", "administrator1",
        "welcome1", "welcome123", "letmein1", "iloveyou1", "abc12345", "abcd1234", "a1234567", "12345678a",
        "changeme1", "monkey123", "dragon123", "sunshine1", "princess1", "football1", "baseball1",
        "dans1234", "dans2026", "compostela1", "philippines1", "pilipinas1",
    };

    /// <summary>Returns an error message, or null when the password is acceptable.</summary>
    public static string? Validate(string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinLength || password.Length > MaxLength)
            return Requirements;
        if (!password.Any(char.IsUpper) || !password.Any(char.IsLower) || !password.Any(char.IsDigit))
            return Requirements;
        if (CommonPasswords.Contains(password))
            return "This password is too common. Please choose a less predictable one.";
        return null;
    }
}

/// <summary>Validates a request property against <see cref="PasswordPolicy"/>.</summary>
[AttributeUsage(AttributeTargets.Property)]
public sealed class StrongPasswordAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        var error = PasswordPolicy.Validate(value as string);
        return error is null ? ValidationResult.Success : new ValidationResult(error, [validationContext.MemberName ?? "Password"]);
    }
}
