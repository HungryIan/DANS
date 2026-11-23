namespace Dans.Api.Infrastructure;

/// <summary>
/// Adds browser security headers to every response:
/// a Content-Security-Policy (only our own scripts may run), no framing (clickjacking),
/// no MIME sniffing, a strict referrer policy and limited browser features.
/// API responses are also marked "no-store" so personal data is never cached.
/// </summary>
public class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "geolocation=(self), camera=(), microphone=(), payment=(), usb=()";
        headers["Cross-Origin-Opener-Policy"] = "same-origin";
        headers["Cross-Origin-Resource-Policy"] = "same-origin";
        headers["X-Permitted-Cross-Domain-Policies"] = "none";

        var path = context.Request.Path;
        if (path.StartsWithSegments("/api") || path.StartsWithSegments("/hubs"))
        {
            headers.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";
            headers.CacheControl = "no-store";
        }
        else
        {
            // Policy for the Angular app when it is served by this API (production build in wwwroot).
            headers.ContentSecurityPolicy = AppPolicy(context.Request.Host.Value ?? "localhost");
        }

        return next(context);
    }

    public static string AppPolicy(string host) => string.Join("; ",
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https://tile.openstreetmap.org",
        $"connect-src 'self' wss://{host}",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests");
}
