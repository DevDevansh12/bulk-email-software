/**
 * Application logger — Pino.
 *
 * WHY Pino over Winston/console.log:
 * - Pino is ~5x faster than Winston (low-overhead JSON serialization)
 * - Structured JSON logs work natively with log aggregators (Datadog, CloudWatch, ELK)
 * - `pino-pretty` gives readable dev output without changing production behavior
 * - Child loggers add context (requestId, userId) without global mutation
 *
 * CONVENTION: Always log with a context object as the first arg:
 *   logger.info({ userId }, 'User logged in')   ✅
 *   logger.info(`User ${userId} logged in`)      ❌ — unstructured, hard to query
 */
import pino from 'pino';

import { env } from '../config/env.js';

const isDev = env.NODE_ENV === 'development';

/**
 * Secrets that must never reach logs. Includes request bodies because the
 * error middleware logs req.body for unexpected errors (SMTP/WhatsApp forms).
 */
const REDACT_PATHS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'smtpPass',
  'smtp_pass',
  'access_token',
  'req.headers.authorization',
  'req.headers.cookie',
  'body.password',
  'body.smtpPass',
  'body.accessToken',
  'body.access_token',
  'body.token',
  '*.smtpPass',
  '*.smtp_pass',
  '*.accessToken',
  '*.access_token',
  '*.password',
];

const devTransport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
  },
};

export const logger = pino(
  isDev
    ? {
        level: env.LOG_LEVEL,
        transport: devTransport,
        redact: {
          paths: REDACT_PATHS,
          censor: '[REDACTED]',
        },
        base: { env: env.NODE_ENV },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : {
        level: env.LOG_LEVEL,
        redact: {
          paths: REDACT_PATHS,
          censor: '[REDACTED]',
        },
        base: { env: env.NODE_ENV },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
);
