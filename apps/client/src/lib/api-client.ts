/**
 * Axios API client — configured once, used everywhere.
 *
 * WHY a singleton client:
 * - Auth token injection happens in one interceptor, not 50 fetch() calls
 * - Response envelope unwrapping in one place
 * - Error normalization in one place
 * - Base URL and timeout configured once
 * 
 * The access token is set by auth.store.ts when the user logs in or when
 * the session is initialized. All requests automatically include the token.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { ApiErrorResponse } from '@saas/shared';

const BASE_URL = import.meta.env['VITE_API_URL'] ?? '';

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies (refresh token) with every request
});

// ── Request interceptor — token is already set by auth.store ──────────────
// No need for request interceptor since auth.store.ts manages the
// Authorization header directly via apiClient.defaults.headers.common

// ── Response interceptor — normalize errors ───────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    const apiError = error.response?.data?.error;

    if (apiError) {
      // Surface the structured API error message
      return Promise.reject(new Error(apiError.message));
    }

    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Request timed out. Please try again.'));
    }

    if (error.response?.status === 401) {
      // Session expired - let the auth store handle this via onAuthStateChange
      return Promise.reject(new Error('Your session has expired. Please sign in again.'));
    }

    return Promise.reject(error);
  }
);
