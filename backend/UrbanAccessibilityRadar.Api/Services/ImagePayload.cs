namespace UrbanAccessibilityRadar.Api.Services;

public static class ImagePayload
{
    private const int MaximumImageBytes = 3 * 1024 * 1024;
    private const int MaximumEncodedCharacters = 4_200_000;
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
    };

    public static bool TryNormalize(string? value, out NormalizedImage image)
    {
        image = default;

        if (string.IsNullOrWhiteSpace(value) || value.Length > MaximumEncodedCharacters)
        {
            return false;
        }

        var input = value.Trim();
        var contentType = "image/jpeg";
        var base64 = input;

        if (input.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            var separatorIndex = input.IndexOf(',');

            if (separatorIndex < 0)
            {
                return false;
            }

            var metadata = input[..separatorIndex];

            if (!metadata.EndsWith(";base64", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            contentType = metadata[5..^7];
            base64 = input[(separatorIndex + 1)..];
        }

        if (!AllowedContentTypes.Contains(contentType))
        {
            return false;
        }

        try
        {
            var bytes = Convert.FromBase64String(base64);

            if (bytes.Length is 0 or > MaximumImageBytes)
            {
                return false;
            }

            image = new NormalizedImage(Convert.ToBase64String(bytes), contentType);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    public readonly record struct NormalizedImage(string Base64, string ContentType);
}
