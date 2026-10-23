using System.Text.Json;
using MongoDB.Bson;
using MongoDB.Driver;
using UrbanAccessibilityRadar.Api.Contracts;
using UrbanAccessibilityRadar.Api.Data;
using UrbanAccessibilityRadar.Api.Models;
using UrbanAccessibilityRadar.Api.Services;

var builder = WebApplication.CreateBuilder(args);

LoadEnvironmentFile(builder);

var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 6 * 1024 * 1024;
});

var mongoConnectionString = builder.Configuration["MongoDB:ConnectionString"]
    ?? throw new InvalidOperationException("MongoDB:ConnectionString is missing.");
var mongoDatabaseName = builder.Configuration["MongoDB:Database"]
    ?? throw new InvalidOperationException("MongoDB:Database is missing.");
var mongoSettings = MongoClientSettings.FromConnectionString(mongoConnectionString);
mongoSettings.ServerSelectionTimeout = TimeSpan.FromSeconds(5);
mongoSettings.ConnectTimeout = TimeSpan.FromSeconds(5);
var mongoClient = new MongoClient(mongoSettings);
var mongoDatabase = mongoClient.GetDatabase(mongoDatabaseName);
builder.Services.AddSingleton<IMongoClient>(mongoClient);
builder.Services.AddSingleton(mongoDatabase);
builder.Services.AddSingleton<IssueRepository>();
builder.Services.AddHttpClient<VisionAnalysisService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(90);
});

var allowedOrigins = (builder.Configuration["Cors:AllowedOrigins"]
        ?? "http://localhost:4200,https://localhost:4200")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors("Frontend");

try
{
    await app.Services.GetRequiredService<IssueRepository>().EnsureIndexesAsync();
}
catch (Exception exception) when (exception is MongoException or TimeoutException)
{
    app.Logger.LogWarning(
        exception,
        "MongoDB indexes could not be created at startup. The API will keep running and retry on demand.");
}

app.MapGet("/api/issues", async (
    IssueRepository repository,
    ILoggerFactory loggerFactory,
    int? limit,
    CancellationToken cancellationToken) =>
{
    try
    {
        var issues = await repository.GetLatestAsync(limit ?? 50, cancellationToken);
        return Results.Ok(issues);
    }
    catch (Exception exception) when (exception is MongoException or TimeoutException)
    {
        loggerFactory.CreateLogger("Issues").LogError(exception, "MongoDB could not list issues.");
        return Results.Problem(
            title: "The reports could not be loaded.",
            detail: "Try again in a moment.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapGet("/api/issues/{id}/image", async (
    string id,
    HttpContext httpContext,
    IssueRepository repository,
    ILoggerFactory loggerFactory,
    CancellationToken cancellationToken) =>
{
    try
    {
        var image = await repository.GetImageAsync(id, cancellationToken);

        if (image is null)
        {
            return Results.NotFound();
        }

        httpContext.Response.Headers.CacheControl = "public, max-age=31536000, immutable";

        return Results.File(
            image.Bytes,
            image.ContentType,
            enableRangeProcessing: true,
            lastModified: image.CreatedAt);
    }
    catch (Exception exception) when (exception is MongoException or TimeoutException)
    {
        loggerFactory.CreateLogger("Issues").LogError(exception, "MongoDB could not load the issue image.");
        return Results.Problem(
            title: "The image could not be loaded.",
            detail: "Try again in a moment.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapPost("/api/issues", async Task<IResult> (
    CreateIssueRequest request,
    IssueRepository repository,
    VisionAnalysisService visionService,
    ILoggerFactory loggerFactory,
    CancellationToken cancellationToken) =>
{
    var errors = new Dictionary<string, string[]>();

    if (request.Latitude is not double latitude || !double.IsFinite(latitude) || latitude is < -90 or > 90)
    {
        errors[nameof(request.Latitude)] = ["Latitude must be between -90 and 90."];
    }

    if (request.Longitude is not double longitude || !double.IsFinite(longitude) || longitude is < -180 or > 180)
    {
        errors[nameof(request.Longitude)] = ["Longitude must be between -180 and 180."];
    }

    if (!ImagePayload.TryNormalize(request.ImageBase64, out var normalizedImage))
    {
        errors[nameof(request.ImageBase64)] = ["Use a valid JPEG, PNG, WEBP, or GIF image under 3 MB."];
    }

    if (errors.Count > 0)
    {
        return Results.ValidationProblem(errors);
    }

    try
    {
        var imageDataUrl = $"data:{normalizedImage.ContentType};base64,{normalizedImage.Base64}";
        var analysis = await visionService.AnalyzeAsync(imageDataUrl, cancellationToken);
        var issue = new Issue
        {
            Classification = analysis.Classification.Trim(),
            Severity = analysis.Severity,
            Description = analysis.Description.Trim(),
            Latitude = request.Latitude!.Value,
            Longitude = request.Longitude!.Value,
            ImageBase64 = normalizedImage.Base64,
            ImageContentType = normalizedImage.ContentType,
            CreatedAt = DateTime.UtcNow
        };

        await repository.InsertAsync(issue, cancellationToken);

        return Results.Created($"/api/issues/{issue.Id}", IssueSummary.FromIssue(issue));
    }
    catch (VisionConfigurationException exception)
    {
        loggerFactory.CreateLogger("Issues").LogError(exception, "The selected AI provider is not configured.");
        return Results.Problem(
            title: "Image analysis is not configured.",
            detail: exception.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (VisionAnalysisException exception)
    {
        loggerFactory.CreateLogger("Issues").LogError(exception, "Image analysis failed.");
        return Results.Problem(
            title: "The image could not be analyzed.",
            detail: "Check the selected AI provider configuration and try again.",
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (HttpRequestException exception)
    {
        loggerFactory.CreateLogger("Issues").LogError(exception, "The image analysis provider could not be reached.");
        return Results.Problem(
            title: "The image analysis service could not be reached.",
            detail: "Try again in a moment.",
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
    {
        loggerFactory.CreateLogger("Issues").LogError(exception, "The image analysis request timed out.");
        return Results.Problem(
            title: "The image analysis request timed out.",
            detail: "Try again in a moment.",
            statusCode: StatusCodes.Status504GatewayTimeout);
    }
    catch (JsonException exception)
    {
        loggerFactory.CreateLogger("Issues").LogError(exception, "The image analysis response could not be read.");
        return Results.Problem(
            title: "The image analysis response was invalid.",
            detail: "Try submitting the image again.",
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (Exception exception) when (exception is MongoException or TimeoutException)
    {
        loggerFactory.CreateLogger("Issues").LogError(exception, "MongoDB could not save the issue.");
        return Results.Problem(
            title: "The report could not be saved.",
            detail: "The database is unavailable. Try again in a moment.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.MapGet("/health/ready", async (IMongoDatabase database, CancellationToken cancellationToken) =>
{
    try
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        await database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), cancellationToken: timeout.Token);
        return Results.Ok(new { status = "ready" });
    }
    catch (Exception exception) when (exception is MongoException or TimeoutException or OperationCanceledException)
    {
        return Results.Problem(
            title: "The database is not reachable.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.Run();

static void LoadEnvironmentFile(WebApplicationBuilder builder)
{
    var candidates = new List<string>();
    var contentRoot = builder.Environment.ContentRootPath;
    var currentDirectory = Directory.GetCurrentDirectory();

    foreach (var start in new[] { contentRoot, currentDirectory })
    {
        if (string.IsNullOrWhiteSpace(start))
        {
            continue;
        }

        var directory = new DirectoryInfo(start);

        while (directory is not null)
        {
            candidates.Add(directory.FullName);
            directory = directory.Parent;
        }
    }

    foreach (var directory in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        var envPath = Path.Combine(directory, ".env");
        if (!File.Exists(envPath))
        {
            continue;
        }

        DotNetEnv.Env.Load(envPath, new DotNetEnv.LoadOptions(clobberExistingVars: false));
        builder.Configuration.AddEnvironmentVariables();
        return;
    }
}
