namespace Dans.Api.Infrastructure;

public static class RateLimits
{
    /// <summary>Limits sign-in and registration attempts per IP address to slow down password guessing.</summary>
    public const string Auth = "auth";
}
