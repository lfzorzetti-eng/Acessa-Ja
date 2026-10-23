import { AppError } from './errors.js';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_ENCODED_CHARACTERS = 4_200_000;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function invalidImage() {
  return new AppError(
    400,
    'Invalid image',
    'Use a valid JPEG, PNG, WEBP, or GIF image under 3 MB.',
  );
}

export function normalizeImage(value) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_ENCODED_CHARACTERS
  ) {
    throw invalidImage();
  }

  const input = value.trim();
  let contentType = 'image/jpeg';
  let encoded = input;

  if (input.slice(0, 5).toLowerCase() === 'data:') {
    const separatorIndex = input.indexOf(',');

    if (separatorIndex < 0) {
      throw invalidImage();
    }

    const metadata = input.slice(0, separatorIndex);

    if (!metadata.toLowerCase().endsWith(';base64')) {
      throw invalidImage();
    }

    contentType = metadata.slice(5, -7).toLowerCase();
    encoded = input.slice(separatorIndex + 1);
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw invalidImage();
  }

  const base64 = encoded.replace(/\s+/g, '');

  if (
    base64.length === 0 ||
    base64.length % 4 !== 0 ||
    !BASE64_PATTERN.test(base64)
  ) {
    throw invalidImage();
  }

  const bytes = Buffer.from(base64, 'base64');

  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw invalidImage();
  }

  return {
    base64: bytes.toString('base64'),
    contentType,
  };
}
