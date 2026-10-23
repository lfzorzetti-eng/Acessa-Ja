namespace UrbanAccessibilityRadar.Api.Contracts;

public sealed class IssueSummary
{
    public required string Id { get; init; }

    public required string Classification { get; init; }

    public required string Severity { get; init; }

    public required string Description { get; init; }

    public double Latitude { get; init; }

    public double Longitude { get; init; }

    public DateTime CreatedAt { get; init; }

    public static IssueSummary FromIssue(Models.Issue issue) => new()
    {
        Id = issue.Id,
        Classification = issue.Classification,
        Severity = issue.Severity,
        Description = issue.Description,
        Latitude = issue.Latitude,
        Longitude = issue.Longitude,
        CreatedAt = issue.CreatedAt
    };
}
