using System.Security.Claims;
using System.Text;
using Dans.Api.Infrastructure;
using Dans.Api.Models;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Dans.Api.Services;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "DANS";
    public string Audience { get; set; } = "DANS";

    /// <summary>Secret used to sign tokens. Must be at least 32 characters.</summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>A session ends after this many hours without activity (it is extended while in use).</summary>
    public int ExpiresInHours { get; set; } = 72;
}

/// <summary>Creates the signed JWT that is stored in the HttpOnly sign-in cookie.</summary>
public class TokenService(IOptions<JwtOptions> options)
{
    private readonly JwtOptions _options = options.Value;

    public string CreateToken(int userId, string fullName, string email, UserRole role, string sessionId, DateTime expiresAt)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Name, fullName),
            new(ClaimTypes.Email, email),
            new(ClaimTypes.Role, role.ToString()),
            new(AuthClaims.SessionId, sessionId),
        };

        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            Expires = expiresAt,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key)),
                SecurityAlgorithms.HmacSha256),
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
