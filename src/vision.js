import { getOpenAiApiKey, getOpenAiModel } from './config.js';
import { AppError } from './errors.js';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT =
  'You review street-level images for barriers to pedestrian and wheelchair accessibility. ' +
  'Identify the clearest visible accessibility issue. Use a short, specific classification such as ' +
  'Broken sidewalk, Blocked curb ramp, Missing tactile paving, or Obstructed walkway. ' +
  'Set severity to low, medium, or high based on immediate risk and how much the route is blocked. ' +
  'Describe only visible evidence. If no accessibility issue is visible, classify it as No clear issue, ' +
  'use low severity, and say that the image does not show a clear barrier.';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    classification: { type: 'string' },
    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
    description: { type: 'string' },
  },
  required: ['classification', 'severity', 'description'],
  additionalProperties: false,
};

function invalidResponse() {
  return new AppError(
    502,
    'Invalid image analysis',
    'The AI provider returned an invalid assessment. Try submitting the image again.',
  );
}

export async function analyzeImage(imageDataUrl) {
  const apiKey = getOpenAiApiKey();

  if (!apiKey) {
    throw new AppError(
      503,
      'Image analysis is not configured',
      'The OPENAI_API_KEY environment variable is missing.',
    );
  }

  let response;

  try {
    response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        temperature: 0.2,
        max_tokens: 300,
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'accessibility_issue',
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this street image and return the required accessibility assessment.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new AppError(
        504,
        'Image analysis timed out',
        'The AI provider took too long to respond. Try again in a moment.',
      );
    }

    throw new AppError(
      502,
      'Image analysis service unreachable',
      'The AI provider could not be reached. Try again in a moment.',
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(
      `OpenAI request failed with status ${response.status}:`,
      body.slice(0, 500),
    );

    throw new AppError(
      502,
      'Image analysis failed',
      'The AI provider could not analyze the image. Try again in a moment.',
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw invalidResponse();
  }

  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw invalidResponse();
  }

  let analysis;

  try {
    analysis = JSON.parse(content);
  } catch {
    throw invalidResponse();
  }

  if (
    typeof analysis?.classification !== 'string' ||
    analysis.classification.trim().length === 0 ||
    typeof analysis?.description !== 'string' ||
    analysis.description.trim().length === 0 ||
    !['low', 'medium', 'high'].includes(analysis?.severity)
  ) {
    throw invalidResponse();
  }

  return {
    classification: analysis.classification.trim(),
    severity: analysis.severity,
    description: analysis.description.trim(),
  };
}
