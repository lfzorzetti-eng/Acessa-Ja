namespace UrbanAccessibilityRadar.Api.Contracts;

public sealed class CreateIssueRequest
{
    public double? Latitude { get; init; }

    public double? Longitude { get; init; }

    public string? ImageBase64 { get; init; }
}
