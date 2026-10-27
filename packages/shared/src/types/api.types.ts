/**
 * Standardized API response envelope.
 *
 * Every API response wraps data in this shape so the client
 * always knows exactly what to expect — success flag, data, and
 * optional meta (pagination, etc.). Errors use ApiErrorResponse.
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    /** Field-level validation errors */
    details?: Record<string, string[]>;
    /** Included only in development */
    stack?: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
