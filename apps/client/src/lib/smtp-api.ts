/**
 * SMTP Settings API client.
 *
 * Wraps the /api/v1/smtp endpoints for per-user SMTP configuration.
 */
import { apiClient } from './api-client';

export interface SmtpSettings {
  id: string;
  userId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  fromEmail: string;
  fromName: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SmtpFormPayload {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  /** Empty string = keep (save) or use (test) the already-saved password */
  smtpPass: string;
  fromEmail: string;
  fromName: string;
}

export interface SmtpTestResult {
  /** Whether the SMTP server accepted the connection + login */
  success: boolean;
  message: string;
  /** True only when the tested credentials are the saved ones and they were marked verified */
  savedSettingsVerified: boolean;
}

export const smtpApi = {
  /** Fetch saved SMTP settings (password is masked/hidden). Returns null if not configured. */
  async get(): Promise<SmtpSettings | null> {
    const res = await apiClient.get<{ success: boolean; data: SmtpSettings | null }>('/smtp');
    return res.data.data;
  },

  /** Save / update SMTP settings. */
  async save(payload: SmtpFormPayload): Promise<SmtpSettings> {
    const res = await apiClient.post<{ success: boolean; data: SmtpSettings }>('/smtp', payload);
    return res.data.data;
  },

  /** Test SMTP credentials without saving them (blank password = saved password). */
  async test(payload: SmtpFormPayload): Promise<SmtpTestResult> {
    const res = await apiClient.post<{ success: boolean; data: SmtpTestResult }>('/smtp/test', payload, { timeout: 30_000 });
    return res.data.data;
  },

  /** Remove SMTP settings — revert to system default. */
  async remove(): Promise<void> {
    await apiClient.delete('/smtp');
  },
};
