namespace Dans.Api.Infrastructure;

/// <summary>
/// The sign-in cookie. It holds the signed JWT and is:
/// HttpOnly (JavaScript cannot read it, so an XSS bug cannot steal it),
/// Secure (only sent over HTTPS), SameSite=Strict (not sent by other websites),
/// and uses the "__Host-" prefix (browser enforces Secure, Path=/ and no Domain).
/// </summary>
public static class AuthCookie
{
    public const string Name = "__Host-dans_auth";

    public static void Append(HttpResponse response, string token, DateTime expiresAt) =>
        response.Cookies.Append(Name, token, Options(expiresAt));

    public static void Delete(HttpResponse response) =>
        response.Cookies.Delete(Name, Options(null));

    private static CookieOptions Options(DateTime? expiresAt) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = "/",
        IsEssential = true,
        Expires = expiresAt,
    };
}

/// <summary>Custom claim types stored in the JWT.</summary>
public static class AuthClaims
{
    public const string SessionId = "dans_sid";
}
