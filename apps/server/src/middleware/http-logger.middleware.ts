import pinoHttpModule from 'pino-http';
import { logger } from '../lib/logger.js';
import type { IncomingMessage, ServerResponse } from 'http';

const pinoHttp = typeof pinoHttpModule === 'function' ? pinoHttpModule : (pinoHttpModule as any).default || pinoHttpModule;

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage & { id?: string }) => req.id || Math.random().toString(36).slice(2),
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req: IncomingMessage, res: ServerResponse) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (_req: IncomingMessage, res: ServerResponse, err: Error) =>
    `Request failed: ${err.message} (${res.statusCode})`,
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/health' || req.url === '/favicon.ico',
  },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
