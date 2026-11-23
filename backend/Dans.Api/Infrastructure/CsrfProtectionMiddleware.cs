namespace Dans.Api.Infrastructure;

/// <summary>
/// Cross-site request forgery (CSRF) protection for the cookie-based sign-in.
/// Every request that changes data (POST, PUT, PATCH, DELETE) to /api must
/// 1) carry the "X-Requested-With: XMLHttpRequest" header — other websites cannot add custom headers
///    to a cross-site request without a CORS permission we never grant, and
/// 2) if the browser sends an Origin header, come from this site or an allowed origin.
/// Together with the SameSite=Strict cookie this follows the OWASP CSRF prevention guidance.
/// </summary>
public class CsrfProtectionMiddleware(RequestDelegate next, IConfiguration configuration)
{
    public const string HeaderName = "X-Requested-With";
    public const string HeaderValue = "XMLHttpRequest";

    private readonly string[] _allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

    public async Task InvokeAsync(HttpContext context)
    {
        var request = context.Request;
        var changesData = !(HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method));

        if (changesData && request.Path.StartsWithSegments("/api"))
        {
            var hasHeader = string.Equals(request.Headers[HeaderName], HeaderValue, StringComparison.Ordinal);
            var origin = request.Headers.Origin.ToString();
            if (!hasHeader || (origin.Length > 0 && !IsAllowedOrigin(request, origin)))
            {
                await Results.Problem(
                        statusCode: StatusCodes.Status403Forbidden,
                        detail: "This request was blocked by cross-site request forgery protection.")
                    .ExecuteAsync(context);
                return;
            }
        }

        await next(context);
    }

    private bool IsAllowedOrigin(HttpRequest request, string origin) =>
        string.Equals(origin, $"{request.Scheme}://{request.Host}", StringComparison.OrdinalIgnoreCase)
        || _allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);
}
