export class AppError extends Error {
  constructor(status, title, detail) {
    super(title);
    this.name = 'AppError';
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

export function isMongoError(error) {
  return typeof error?.name === 'string' && error.name.startsWith('Mongo');
}

export function sendError(res, error) {
  if (res.headersSent) {
    return;
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({
      title: error.title,
      detail: error.detail,
      status: error.status,
    });
  }

  if (isMongoError(error)) {
    console.error('MongoDB operation failed:', error);
    return res.status(503).json({
      title: 'Database unavailable',
      detail: 'The report could not be saved or loaded. Try again in a moment.',
      status: 503,
    });
  }

  console.error(error);

  return res.status(500).json({
    title: 'Internal server error',
    detail: 'Something went wrong. Try again in a moment.',
    status: 500,
  });
}
