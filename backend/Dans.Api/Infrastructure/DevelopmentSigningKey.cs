using System.Security.Cryptography;

namespace Dans.Api.Infrastructure;

/// <summary>
/// Development only: a random key for signing session tokens, kept in "dev-signing.key" in the API folder.
/// The file is created on the first start and is git-ignored, so no signing key is ever committed to the repository
/// and every computer gets its own. Deleting the file signs everyone out. Production must set Jwt:Key
/// (environment variable Jwt__Key) instead.
/// </summary>
public static class DevelopmentSigningKey
{
    public const string FileName = "dev-signing.key";

    public static string LoadOrCreate(string folder)
    {
        var path = Path.Combine(folder, FileName);
        if (File.Exists(path))
        {
            var existing = File.ReadAllText(path).Trim();
            if (existing.Length >= 32) return existing;
        }

        var key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        File.WriteAllText(path, key);
        return key;
    }
}
