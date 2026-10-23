const DEFAULT_DATABASE = 'urban_accessibility_radar';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_PORT = 5080;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getMongoUri() {
  return clean(process.env.MONGODB_URI);
}

export function getMongoDatabase() {
  return clean(process.env.MONGODB_DB) || DEFAULT_DATABASE;
}

export function getOpenAiApiKey() {
  return clean(process.env.OPENAI_API_KEY);
}

export function getOpenAiModel() {
  return clean(process.env.OPENAI_MODEL) || DEFAULT_MODEL;
}

export function getPort() {
  const port = Number.parseInt(clean(process.env.PORT), 10);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}
