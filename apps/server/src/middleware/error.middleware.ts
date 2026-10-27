import type { Request, Response, NextFunction } from 'express';
import type { ApiErrorResponse } from '@saas/shared';
import { HttpStatus } from '@saas/shared';
import { AppError } from '../lib/app-error.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof SyntaxError && 'body' in err) {
    // Malformed JSON body
    appError = new AppError(
      'Invalid JSON in request body',
      HttpStatus.BAD_REQUEST,
      'INVALID_JSON'
    );
  } else {
    // Unknown / programming error — treat as 500
    appError = new AppError(
      'An unexpected error occurred',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR'
    );
    // Non-operational: log with full error for alerting
    logger.error(
      { 
        err: err instanceof Error ? {
          name: err.name,
          message: err.message,
          stack: err.stack,
        } : err,
        requestId: req.id,
        method: req.method,
        url: req.url,
        body: req.body,
        query: req.query,
      }, 
      'Unhandled error - see error details'
    );
  }

  // ── Log operational errors at appropriate level ───────────────────────────
  if (appError.isOperational) {
    if (appError.statusCode >= 500) {
      logger.error({ err: appError, requestId: req.id }, appError.message);
    } else {
      logger.warn(
        { statusCode: appError.statusCode, code: appError.code, requestId: req.id },
        appError.message
      );
    }
  }

  // ── Build response ────────────────────────────────────────────────────────
  const response: ApiErrorResponse = {
    success: false,
    error: {
      message: appError.message,
      code: appError.code,
      ...(appError.details && { details: appError.details }),
      // Only expose stack traces in development
      ...(env.NODE_ENV === 'development' && { stack: appError.stack }),
    },
  };

  res.status(appError.statusCode).json(response);
}

/**
 * 404 handler — must be registered BEFORE the error middleware,
 * AFTER all route registrations.
 */
export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.url}`, HttpStatus.NOT_FOUND, 'ROUTE_NOT_FOUND'));
}
