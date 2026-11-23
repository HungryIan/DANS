using System.Security.Claims;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Dans.Api.Data;
using Dans.Api.Hubs;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Dans.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

// "dotnet run -- --export-schema <folder>" writes the database CREATE scripts (see Data/SchemaExport.cs) and exits.
if (args is ["--export-schema", var schemaFolder])
{
    SchemaExport.Write(schemaFolder);
    return;
}

var builder = WebApplication.CreateBuilder(args);

// ---------- Web server hardening ----------
builder.WebHost.ConfigureKestrel(options =>
{
    options.AddServerHeader = false;                 // don't advertise the server software
    options.Limits.MaxRequestBodySize = 1_048_576;   // 1 MB is plenty for this API's JSON requests
});

// ---------- Database (SQLite by default; set Database:Provider to "SqlServer" to use SQL Server) ----------
var connectionString = builder.Configuration.GetConnectionString("Default") ?? "Data Source=dans.db";
var databaseProvider = builder.Configuration["Database:Provider"] ?? "Sqlite";
builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (databaseProvider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
        options.UseSqlServer(connectionString);
    else
        options.UseSqlite(connectionString);
});

// ---------- Authentication: signed JWT inside an HttpOnly cookie, checked against a server-side session ----------
// In Development without a configured key, use this computer's own random key (see DevelopmentSigningKey).
if (builder.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(builder.Configuration["Jwt:Key"]))
{
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Jwt:Key"] = DevelopmentSigningKey.LoadOrCreate(builder.Environment.ContentRootPath),
    });
}
var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwt.Key) || jwt.Key.Length < 32)
    throw new InvalidOperationException(
        "Jwt:Key is missing or shorter than 32 characters. Set it in appsettings or with the Jwt__Key environment variable.");
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role,
        };
        options.Events = new JwtBearerEvents
        {
            // Read the token from the HttpOnly cookie (also used by the SignalR WebSocket connection).
            OnMessageReceived = context =>
            {
                if (context.Request.Cookies.TryGetValue(AuthCookie.Name, out var token) && !string.IsNullOrEmpty(token))
                    context.Token = token;
                return Task.CompletedTask;
            },
            // The session must still exist, not be revoked, and belong to an active user with the same role.
            OnTokenValidated = async context =>
            {
                var principal = context.Principal;
                var sessions = context.HttpContext.RequestServices.GetRequiredService<AuthSessionService>();
                var session = await sessions.FindActiveAsync(
                    principal?.FindUserId(),
                    principal?.FindFirst(AuthClaims.SessionId)?.Value,
                    principal?.FindFirst(ClaimTypes.Role)?.Value);

                if (session is null)
                {
                    AuthCookie.Delete(context.Response);
                    context.Fail("This session has ended. Please sign in again.");
                    return;
                }
                await sessions.RenewIfDueAsync(context.HttpContext, session);
            },
        };
    });
builder.Services.AddAuthorization();

// ---------- Rate limiting ----------
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Every API client (per IP address) gets at most 300 requests per minute.
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
        httpContext.Request.Path.StartsWithSegments("/api")
            ? RateLimitPartition.GetFixedWindowLimiter(
                httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 300, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })
            : RateLimitPartition.GetNoLimiter("static"));

    // Sign-in and registration: at most 20 attempts per minute per IP (accounts also lock after 5 wrong passwords).
    options.AddPolicy(RateLimits.Auth, httpContext => RateLimitPartition.GetFixedWindowLimiter(
        httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));

    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { status = 429, detail = "Too many requests. Please wait a minute and try again." }, cancellationToken);
    };
});

// ---------- HTTPS ----------
builder.Services.AddHsts(options =>
{
    options.MaxAge = TimeSpan.FromDays(365);
    options.IncludeSubDomains = true;
});

// When hosted behind a reverse proxy (IIS, nginx) that terminates HTTPS, trust its X-Forwarded-* headers.
var behindProxy = builder.Configuration.GetValue<bool>("ReverseProxy:Enabled");
if (behindProxy)
{
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);
}

// ---------- MVC, SignalR and the rest ----------
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(allowIntegerValues: false)));

builder.Services
    .AddSignalR(options => options.MaximumReceiveMessageSize = 4 * 1024) // clients only listen; they never send large messages
    .AddJsonProtocol(options => options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<AuthSessionService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<AlertService>();
builder.Services.AddSingleton<HubConnectionRegistry>();

var app = builder.Build();

// Create the database (if needed) and add the starting data.
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await DbSeeder.EnsureDatabaseAsync(db, app.Environment, app.Logger);
    await DbSeeder.SeedAsync(db, scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>(),
        app.Configuration, app.Environment, app.Logger);
}

if (behindProxy)
    app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseExceptionHandler();   // generic error responses, no stack traces
    app.UseHsts();               // browsers must use HTTPS for a year
}

app.UseHttpsRedirection();
app.UseMiddleware<SecurityHeadersMiddleware>();

// Serve the production Angular build (npm run build writes it to wwwroot) from the same HTTPS origin.
var hostsFrontend = File.Exists(Path.Combine(app.Environment.ContentRootPath, "wwwroot", "index.html"));
if (hostsFrontend)
{
    app.UseDefaultFiles();
    app.UseStaticFiles(new StaticFileOptions
    {
        OnPrepareResponse = ctx =>
        {
            if (ctx.File.Name == "index.html")
                ctx.Context.Response.Headers.CacheControl = "no-cache";
        },
    });
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.UseMiddleware<CsrfProtectionMiddleware>();

app.MapControllers();
// Close a connection when its sign-in token expires; the browser reconnects with its renewed cookie.
app.MapHub<NotificationHub>(NotificationHub.Path, options => options.CloseOnAuthenticationExpiration = true);
app.MapFallback("/api/{**path}", () => Results.Problem(statusCode: StatusCodes.Status404NotFound, detail: "API endpoint not found."));
if (hostsFrontend)
    app.MapFallbackToFile("index.html");

app.Run();
