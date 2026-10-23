const MAX_DIMENSION = 1600;
const MAX_OUTPUT_BYTES = 2_500_000;
const INITIAL_QUALITY = 0.82;

function render(bitmap, scale, quality) {
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not supported in this browser.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

function estimateBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

export async function compressImage(file) {
  const bitmap = await createImageBitmap(file);

  try {
    let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    let quality = INITIAL_QUALITY;
    let dataUrl = render(bitmap, scale, quality);
    let bytes = estimateBytes(dataUrl);

    for (let attempt = 0; bytes > MAX_OUTPUT_BYTES && attempt < 10; attempt += 1) {
      if (quality > 0.55) {
        quality = Math.max(0.55, quality - 0.08);
      } else {
        scale *= 0.85;
      }

      dataUrl = render(bitmap, scale, quality);
      bytes = estimateBytes(dataUrl);
    }

    if (bytes > MAX_OUTPUT_BYTES) {
      throw new Error('The image could not be compressed enough.');
    }

    return { dataUrl, bytes };
  } finally {
    bitmap.close();
  }
}
