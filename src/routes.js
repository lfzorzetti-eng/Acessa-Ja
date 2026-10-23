import { randomUUID } from 'node:crypto';
import { getDatabase, pingDatabase } from './db.js';
import { AppError, sendError } from './errors.js';
import { normalizeImage } from './images.js';
import { analyzeImage } from './vision.js';

const MAXIMUM_PAGE_SIZE = 50;
const NEEDS = new Set([
  'wheelchair',
  'blind',
  'low_vision',
  'deaf',
  'mobility',
  'elderly',
  'general',
]);
const CATEGORY_DEFAULT_NEED = {
  sidewalk: 'mobility',
  curb_ramp: 'wheelchair',
  tactile_paving: 'blind',
  obstruction: 'mobility',
  crossing: 'low_vision',
  public_transport: 'mobility',
  other: 'general',
};

function normalizeNeed(value, category) {
  if (typeof value === 'string' && NEEDS.has(value)) {
    return value;
  }

  return CATEGORY_DEFAULT_NEED[category] ?? 'general';
}

function toSummary(document) {
  const category = document.category ?? document.Category ?? 'other';

  return {
    id: document._id,
    classification: document.classification ?? document.Classification ?? '',
    category,
    need: normalizeNeed(document.need ?? document.Need, category),
    severity: document.severity ?? document.Severity ?? 'low',
    description: document.description ?? document.Description ?? '',
    latitude: document.latitude ?? document.Latitude ?? 0,
    longitude: document.longitude ?? document.Longitude ?? 0,
    createdAt: document.createdAt ?? document.CreatedAt ?? new Date(0),
  };
}

function parseLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);

  if (!Number.isInteger(parsed)) {
    return MAXIMUM_PAGE_SIZE;
  }

  return Math.min(MAXIMUM_PAGE_SIZE, Math.max(1, parsed));
}

function validationError(detail) {
  return new AppError(400, 'Validation failed', detail);
}

export function registerRoutes(app) {
  app.get('/health', (_req, res) => {
    res.json({ status: 'healthy' });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await pingDatabase();
      res.json({ status: 'ready' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/issues', async (req, res) => {
    try {
      const limit = parseLimit(req.query.limit);
      const database = await getDatabase();
      const documents = await database
        .collection('issues')
        .find(
          {},
          { projection: { imageBase64: 0, ImageBase64: 0 } },
        )
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      res.json(documents.map(toSummary));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/issues/:id/image', async (req, res) => {
    try {
      const database = await getDatabase();
      const document = await database.collection('issues').findOne(
        { _id: req.params.id },
        {
          projection: {
            imageBase64: 1,
            ImageBase64: 1,
            imageContentType: 1,
            ImageContentType: 1,
          },
        },
      );

      const base64 = document?.imageBase64 ?? document?.ImageBase64;

      if (typeof base64 !== 'string' || base64.length === 0) {
        return res.status(404).json({
          title: 'Not found',
          detail: 'The requested report image does not exist.',
          status: 404,
        });
      }

      const bytes = Buffer.from(base64, 'base64');

      if (bytes.length === 0) {
        return res.status(404).json({
          title: 'Not found',
          detail: 'The requested report image does not exist.',
          status: 404,
        });
      }

      res.set({
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type':
          document.imageContentType ??
          document.ImageContentType ??
          'image/jpeg',
        'Content-Length': String(bytes.length),
      });

      return res.send(bytes);
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post('/api/issues', async (req, res) => {
    try {
      const body = req.body ?? {};
      const latitude = body.latitude;
      const longitude = body.longitude;

      if (
        typeof latitude !== 'number' ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
      ) {
        throw validationError('Latitude must be between -90 and 90.');
      }

      if (
        typeof longitude !== 'number' ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        throw validationError('Longitude must be between -180 and 180.');
      }

      const image = normalizeImage(body.imageBase64);
      const database = await getDatabase();
      const analysis = await analyzeImage(
        `data:${image.contentType};base64,${image.base64}`,
      );

      const issue = {
        _id: randomUUID(),
        classification: analysis.classification,
        category: analysis.category,
        need: analysis.need,
        severity: analysis.severity,
        description: analysis.description,
        latitude,
        longitude,
        imageBase64: image.base64,
        imageContentType: image.contentType,
        createdAt: new Date(),
      };

      await database.collection('issues').insertOne(issue);

      return res
        .status(201)
        .location(`/api/issues/${issue._id}`)
        .json(toSummary(issue));
    } catch (error) {
      return sendError(res, error);
    }
  });
}
