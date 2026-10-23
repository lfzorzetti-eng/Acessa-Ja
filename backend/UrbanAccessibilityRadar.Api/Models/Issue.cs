using MongoDB.Bson.Serialization.Attributes;

namespace UrbanAccessibilityRadar.Api.Models;

public sealed class Issue
{
    [BsonId]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    public required string Classification { get; set; }

    public required string Severity { get; set; }

    public required string Description { get; set; }

    public double Latitude { get; set; }

    public double Longitude { get; set; }

    public required string ImageBase64 { get; set; }

    public string ImageContentType { get; set; } = "image/jpeg";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
