import express from 'express';
import { registerRoutes } from './src/routes.js';
import { sendError } from './src/errors.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '4.2mb' }));

registerRoutes(app);

app.use('/api', (_req, res) => {
  res.status(404).json({
    title: 'Not found',
    detail: 'The requested API route does not exist.',
    status: 404,
  });
});

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      title: 'Payload too large',
      detail: 'The request body exceeds the 4.2 MB limit.',
      status: 413,
    });
  }

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      title: 'Invalid JSON',
      detail: 'The request body is not valid JSON.',
      status: 400,
    });
  }

  return sendError(res, error);
});

export default app;
