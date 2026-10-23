namespace UrbanAccessibilityRadar.Api.Contracts;

public sealed class VisionAnalysis
{
    public required string Classification { get; init; }

    public required string Severity { get; init; }

    public required string Description { get; init; }
}
