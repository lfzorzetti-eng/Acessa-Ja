using MongoDB.Driver;
using UrbanAccessibilityRadar.Api.Contracts;
using UrbanAccessibilityRadar.Api.Models;

namespace UrbanAccessibilityRadar.Api.Data;

public sealed class IssueRepository
{
    private const int MaximumPageSize = 50;
    private readonly IMongoCollection<Issue> _issues;

    public IssueRepository(IMongoDatabase database)
    {
        _issues = database.GetCollection<Issue>("issues");
    }

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken = default)
    {
        var index = new CreateIndexModel<Issue>(
            Builders<Issue>.IndexKeys.Descending(issue => issue.CreatedAt));
        await _issues.Indexes.CreateOneAsync(index, cancellationToken: cancellationToken);
    }

    public async Task<List<IssueSummary>> GetLatestAsync(
        int limit,
        CancellationToken cancellationToken = default)
    {
        var pageSize = Math.Clamp(limit, 1, MaximumPageSize);
        var projection = Builders<Issue>.Projection
            .Exclude(issue => issue.ImageBase64);

        var issues = await _issues.Find(Builders<Issue>.Filter.Empty)
            .SortByDescending(issue => issue.CreatedAt)
            .Limit(pageSize)
            .Project<Issue>(projection)
            .ToListAsync(cancellationToken);

        return issues.Select(IssueSummary.FromIssue).ToList();
    }

    public async Task<IssueImage?> GetImageAsync(
        string id,
        CancellationToken cancellationToken = default)
    {
        var projection = Builders<Issue>.Projection
            .Include(issue => issue.ImageBase64)
            .Include(issue => issue.ImageContentType)
            .Include(issue => issue.CreatedAt);

        var issue = await _issues.Find(issue => issue.Id == id)
            .Project<Issue>(projection)
            .FirstOrDefaultAsync(cancellationToken);

        if (issue is null || string.IsNullOrWhiteSpace(issue.ImageBase64))
        {
            return null;
        }

        try
        {
            var bytes = Convert.FromBase64String(issue.ImageBase64);
            var contentType = string.IsNullOrWhiteSpace(issue.ImageContentType)
                ? "image/jpeg"
                : issue.ImageContentType;

            return new IssueImage(bytes, contentType, issue.CreatedAt);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    public Task InsertAsync(Issue issue, CancellationToken cancellationToken = default) =>
        _issues.InsertOneAsync(issue, cancellationToken: cancellationToken);
}

public sealed record IssueImage(byte[] Bytes, string ContentType, DateTime CreatedAt);
