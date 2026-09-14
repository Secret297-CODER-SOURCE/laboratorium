import config from '../config/index.js';
import * as errorLogService from '../services/error-log.service.js';

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  if (!err.isOperational) {
    console.error('[error]', err);
    errorLogService.log({
      source: 'server',
      message: err.message,
      stack: err.stack,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      userId: req.user?.id,
    });
  }

  res.status(statusCode).json({
    error: err.message || 'Внутрішня помилка сервера',
    code,
    ...(err.billing ? { billing: err.billing } : {}),
    ...(config.env === 'development' && !err.isOperational ? { stack: err.stack } : {}),
  });
}

export function notFoundHandler(req, res) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint не знайдено', code: 'NOT_FOUND' });
  }
  res.status(404).send('Not Found');
}
