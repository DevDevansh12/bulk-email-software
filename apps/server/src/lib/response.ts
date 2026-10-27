/**
 * Response helper utilities.
 *
 * WHY: Eliminates the verbosity of constructing the ApiResponse envelope
 * inline in every route handler. All responses share a consistent shape.
 */
import type { Response } from 'express';
import type { ApiSuccessResponse, PaginatedResponse, PaginationMeta } from '@saas/shared';
import { HttpStatus } from '@saas/shared';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = HttpStatus.OK,
  meta?: Record<string, unknown>
): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
  };
  res.status(statusCode).json(body);
}

export function sendCreated<T>(res: Response, data: T): void {
  const body: ApiSuccessResponse<T> = { success: true, data };
  res.status(HttpStatus.CREATED).json(body);
}

export function sendNoContent(res: Response): void {
  res.status(HttpStatus.NO_CONTENT).send();
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  pagination: PaginationMeta
): void {
  const data: PaginatedResponse<T> = { items, pagination };
  sendSuccess(res, data, HttpStatus.OK, { pagination });
}
