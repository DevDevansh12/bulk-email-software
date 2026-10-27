/**
 * Custom application error class.
 *
 * WHY a custom error class:
 * - Native `Error` has no `statusCode` or `code` — we'd end up with ad-hoc
 *   property assignments scattered everywhere.
 * - A typed class lets the global error handler distinguish "expected" operational
 *   errors (AppError) from unexpected programming errors (plain Error).
 * - The `isOperational` flag is key: operational errors (e.g., 404, validation
 *   failures) are user-facing. Non-operational errors indicate bugs — they should
 *   trigger alerts/restarts in production.
 */
import type { HttpStatusCode } from '@saas/shared';
import { HttpStatus } from '@saas/shared';

export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  /** Machine-readable error code — used by the client for i18n / specific handling */
  public readonly code: string;
  /** true = expected, user-caused error. false = unexpected bug. */
  public readonly isOperational: boolean;
  /** Field-level validation errors */
  public readonly details?: Record<string, string[]> | undefined;

  constructor(
    message: string,
    statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
    code = 'INTERNAL_ERROR',
    details?: Record<string, string[]> | undefined
  ) {
    super(message);

    // Restore prototype chain (required when extending built-ins in TS)
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Convenience factory methods ──────────────────────────────────────────────
// Keeps route handlers clean: throw AppError.notFound('User not found')

export const createError = {
  badRequest: (message: string, details?: Record<string, string[]>) =>
    new AppError(message, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', details),

  unauthorized: (message = 'Authentication required') =>
    new AppError(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED'),

  forbidden: (message = 'Access denied') =>
    new AppError(message, HttpStatus.FORBIDDEN, 'FORBIDDEN'),

  notFound: (resource = 'Resource') =>
    new AppError(`${resource} not found`, HttpStatus.NOT_FOUND, 'NOT_FOUND'),

  conflict: (message: string) =>
    new AppError(message, HttpStatus.CONFLICT, 'CONFLICT'),

  unprocessable: (message: string, details?: Record<string, string[]>) =>
    new AppError(
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'UNPROCESSABLE_ENTITY',
      details
    ),

  tooManyRequests: (message = 'Too many requests') =>
    new AppError(message, HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED'),

  internal: (message = 'An unexpected error occurred') =>
    new AppError(message, HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR'),
};
