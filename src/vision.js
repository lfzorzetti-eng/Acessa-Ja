import { getOpenAiApiKey, getOpenAiModel } from './config.js';
import { AppError } from './errors.js';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
// Keep this below the Vercel function limit (60s) to leave room for Mongo and the response.
const REQUEST_TIMEOUT_MS = 50_000;

const CATEGORIES = ['sidewalk', 'curb_ramp', 'tactile_paving', 'obstruction', 'crossing', 'public_transport', 'other'];
const NEEDS = ['wheelchair', 'blind', 'low_vision', 'deaf', 'mobility', 'elderly', 'general'];
const SEVERITIES = ['low', 'medium', 'high'];

const SYSTEM_PROMPT =
  'You are an accessibility inspector reviewing a real street-level photo. ' +
  'Look carefully at the image and identify the single most important barrier for people with disabilities. ' +
  'Assign exactly one category from: ' + CATEGORIES.join(', ') + '. ' +
  'Then assign exactly one need describing the group most affected by the barrier: ' +
  'wheelchair (wheelchair or mobility-scooter users: steps, high curbs, missing or blocked ramps, narrow passages), ' +
  'blind (people who navigate with a cane or guide dog: missing tactile paving, unguarded holes, obstacles at body or head height, path edges that cannot be detected), ' +
  'low_vision (people with partial sight: poor contrast, missing visual markings, glare or unsafe crossings), ' +
  'deaf (deaf or hard-of-hearing people: missing visual signals, silent crossings, hazards that rely on sound cues), ' +
  'mobility (people using canes, walkers or with reduced stamina: uneven surfaces, long detours, steep slopes), ' +
  'elderly (older people: uneven or slippery surfaces, missing handrails or rest areas, long crossing times), ' +
  'general (the barrier affects the general public and no group above is clearly more affected). ' +
  'Identify the clearest visible issue. Use a short, specific classification such as ' +
  'Broken sidewalk, Blocked curb ramp, Missing tactile paving, or Obstructed walkway. ' +
  'Set severity to low, medium, or high based on immediate risk and how much the route is blocked. ' +
  'Describe only evidence that is actually visible in the photo. If no accessibility issue is visible, ' +
  'classify it as No clear issue, use category other and need general, use low severity, and say that ' +
  'the image does not show a clear barrier.';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    classification: { type: 'string' },
    category: {
      type: 'string',
      enum: CATEGORIES,
    },
    need: {
      type: 'string',
      enum: NEEDS,
    },
    severity: { type: 'string', enum: SEVERITIES },
    description: { type: 'string' },
  },
  required: ['classification', 'category', 'need', 'severity', 'description'],
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
        max_tokens: 400,
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
    !CATEGORIES.includes(analysis?.category) ||
    !NEEDS.includes(analysis?.need) ||
    typeof analysis?.description !== 'string' ||
    analysis.description.trim().length === 0 ||
    !SEVERITIES.includes(analysis?.severity)
  ) {
    throw invalidResponse();
  }

  return {
    classification: analysis.classification.trim(),
    category: analysis.category,
    need: analysis.need,
    severity: analysis.severity,
    description: analysis.description.trim(),
  };
}
