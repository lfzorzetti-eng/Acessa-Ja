using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using UrbanAccessibilityRadar.Api.Contracts;

namespace UrbanAccessibilityRadar.Api.Services;

public sealed class VisionAnalysisService(
    HttpClient httpClient,
    IConfiguration configuration)
{
    private const string OpenAiEndpoint = "https://api.openai.com/v1/chat/completions";
    private const string DefaultModel = "gpt-4o-mini";
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    public async Task<VisionAnalysis> AnalyzeAsync(string imageDataUrl, CancellationToken cancellationToken)
    {
        var providerName = configuration["AI:Provider"] ?? "OpenAI";
        var provider = GetProvider(providerName);
        using var request = CreateRequest(provider, imageDataUrl);

        using var response = await httpClient.SendAsync(request, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new VisionAnalysisException($"The {provider.Name} provider returned status code {(int)response.StatusCode}.");
        }

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var responseDocument = await JsonDocument.ParseAsync(
            responseStream,
            cancellationToken: cancellationToken);

        var content = responseDocument.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new VisionAnalysisException($"The {provider.Name} provider returned an empty image assessment.");
        }

        var analysis = JsonSerializer.Deserialize<VisionAnalysis>(content, SerializerOptions);

        if (analysis is null ||
            string.IsNullOrWhiteSpace(analysis.Classification) ||
            string.IsNullOrWhiteSpace(analysis.Description) ||
            analysis.Severity is not ("low" or "medium" or "high"))
        {
            throw new VisionAnalysisException($"The {provider.Name} provider returned an invalid image assessment.");
        }

        return analysis;
    }

    private HttpRequestMessage CreateRequest(AiProvider provider, string imageDataUrl)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, provider.Endpoint);

        if (provider.UsesApiKeyHeader)
        {
            request.Headers.Add("api-key", provider.ApiKey);
        }
        else
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", provider.ApiKey);
        }

        request.Content = JsonContent.Create(new
        {
            model = provider.Model,
            temperature = 0.2,
            max_tokens = 300,
            stream = false,
            response_format = new
            {
                type = "json_schema",
                json_schema = new
                {
                    name = "accessibility_issue",
                    strict = true,
                    schema = new
                    {
                        type = "object",
                        properties = new
                        {
                            classification = new { type = "string" },
                            severity = new { type = "string", @enum = new[] { "low", "medium", "high" } },
                            description = new { type = "string" }
                        },
                        required = new[] { "classification", "severity", "description" },
                        additionalProperties = false
                    }
                }
            },
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content = "You review street-level images for barriers to pedestrian and wheelchair accessibility. Identify the clearest visible accessibility issue. Use a short, specific classification such as Broken sidewalk, Blocked curb ramp, Missing tactile paving, or Obstructed walkway. Set severity to low, medium, or high based on immediate risk and how much the route is blocked. Describe only visible evidence. If no accessibility issue is visible, classify it as No clear issue, use low severity, and say that the image does not show a clear barrier."
                },
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new
                        {
                            type = "text",
                            text = "Analyze this street image and return the required accessibility assessment."
                        },
                        new
                        {
                            type = "image_url",
                            image_url = new
                            {
                                url = imageDataUrl,
                                detail = "high"
                            }
                        }
                    }
                }
            }
        });

        return request;
    }

    private AiProvider GetProvider(string providerName)
    {
        if (string.Equals(providerName, "AzureFoundry", StringComparison.OrdinalIgnoreCase))
        {
            var endpoint = configuration["AI:AzureFoundry:Endpoint"]
                ?? configuration["AZURE_AI_FOUNDRY_ENDPOINT"];
            var apiKey = configuration["AI:AzureFoundry:ApiKey"]
                ?? configuration["AZURE_AI_FOUNDRY_API_KEY"];
            var deployment = configuration["AI:AzureFoundry:Deployment"]
                ?? configuration["AZURE_AI_FOUNDRY_DEPLOYMENT"]
                ?? DefaultModel;

            if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(apiKey))
            {
                throw new VisionConfigurationException(
                    "Azure AI Foundry requires an endpoint and API key.");
            }

            return new AiProvider(
                "Azure AI Foundry",
                NormalizeFoundryEndpoint(endpoint),
                apiKey,
                deployment,
                true);
        }

        if (string.Equals(providerName, "OpenAI", StringComparison.OrdinalIgnoreCase))
        {
            var apiKey = configuration["AI:OpenAI:ApiKey"]
                ?? configuration["OPENAI_API_KEY"]
                ?? configuration["OpenAI:ApiKey"];
            var model = configuration["AI:OpenAI:Model"] ?? DefaultModel;

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new VisionConfigurationException("OpenAI requires an API key.");
            }

            return new AiProvider("OpenAI", new Uri(OpenAiEndpoint), apiKey, model, false);
        }

        throw new VisionConfigurationException(
            "The AI provider must be AzureFoundry or OpenAI.");
    }

    private static Uri NormalizeFoundryEndpoint(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var endpointUri) ||
            endpointUri.Scheme is not ("https" or "http"))
        {
            throw new VisionConfigurationException(
                "Azure AI Foundry endpoint must be an absolute HTTP or HTTPS URL.");
        }

        var builder = new UriBuilder(endpointUri);
        var path = builder.Path.TrimEnd('/');

        if (!path.EndsWith("/openai/v1", StringComparison.OrdinalIgnoreCase))
        {
            path = string.IsNullOrEmpty(path) ? "/openai/v1" : $"{path}/openai/v1";
        }

        builder.Path = $"{path}/chat/completions";
        builder.Query = string.Empty;
        return builder.Uri;
    }

    private sealed record AiProvider(
        string Name,
        Uri Endpoint,
        string ApiKey,
        string Model,
        bool UsesApiKeyHeader);
}

public sealed class VisionConfigurationException(string message) : Exception(message)
{
}

public sealed class VisionAnalysisException(string message) : Exception(message)
{
}
