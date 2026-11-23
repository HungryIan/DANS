namespace Dans.Api.Infrastructure;

/// <summary>Small helpers for cleaning user input.</summary>
public static class Text
{
    /// <summary>Accepts 09XX XXX XXXX, 09XX-XXX-XXXX or +639XXXXXXXXX.</summary>
    public const string PhonePattern = @"^(\+63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}$";
    public const string PhoneMessage = "Enter a valid mobile number, e.g. 09171234567.";

    /// <summary>Any dialable number: hotlines (911, 143), landlines ((082) 123-4567) or mobiles. Digits, spaces, +, - and
    /// parentheses only, with at least 3 digits.</summary>
    public const string ContactNumberPattern = @"^(?=(?:\D*\d){3})[0-9+()\-\s]{3,50}$";
    public const string ContactNumberMessage = "Enter a phone number using digits, spaces, +, - or parentheses, e.g. 911 or 0917 123 4567.";

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    /// <summary>Converts any accepted format to 09XXXXXXXXX.</summary>
    public static string NormalizePhone(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        return digits.StartsWith("63") ? "0" + digits[2..] : digits;
    }

    public static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..(maxLength - 1)].TrimEnd() + "…";

    /// <summary>Builds a LIKE pattern that matches the term anywhere, escaping wildcard characters.</summary>
    public static string ContainsPattern(string term) =>
        "%" + term.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_") + "%";

    public const string LikeEscape = @"\";

    /// <summary>Splits a multi-line text into trimmed, non-empty lines.</summary>
    public static List<string> Lines(string? value) =>
        (value ?? string.Empty).Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();

    public static string JoinLines(IEnumerable<string> lines) =>
        string.Join("\n", lines.Select(l => l.Trim()).Where(l => l.Length > 0));
}
