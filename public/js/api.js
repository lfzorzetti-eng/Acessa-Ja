const API_BASE = '/api';
const LIST_TIMEOUT_MS = 15_000;
const CREATE_TIMEOUT_MS = 120_000;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function readPayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(payload, fallback) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.detail === 'string' && payload.detail.length > 0) {
      return payload.detail;
    }

    if (typeof payload.title === 'string' && payload.title.length > 0) {
      return payload.title;
    }
  }

  return fallback;
}

export async function getIssues() {
  const response = await fetch(`${API_BASE}/issues?limit=50`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new ApiError(response.status, 'The reports could not be loaded.');
  }

  return response.json();
}

export function imageUrl(id) {
  return `${API_BASE}/issues/${encodeURIComponent(String(id))}/image`;
}

export async function createIssue(payload) {
  const response = await fetch(`${API_BASE}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
  });

  const data = await readPayload(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      errorMessage(data, 'The report could not be saved.'),
    );
  }

  return data;
}
