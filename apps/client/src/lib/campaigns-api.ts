import type { 
  DashboardStats, 
  CampaignSummary, 
  CampaignDetail, 
  ParsePreviewResponse,
  CampaignCreateResult,
} from '@saas/shared';

import { apiClient } from './api-client';

/**
 * Get authorization headers from the centralized apiClient.
 * This ensures we always use the current valid token managed by auth.store.
 */
const getAuthHeaders = () => {
  const token = apiClient.defaults.headers.common['Authorization'] as string | undefined;
  return token ? { Authorization: token } : {};
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const headers = getAuthHeaders();
  const response = await apiClient.get<{ success: boolean; data: DashboardStats }>('/campaigns/stats', { headers });
  return response.data.data;
}

export async function fetchCampaigns(page: number = 1, limit: number = 10): Promise<{ campaigns: CampaignSummary[], total: number }> {
  const headers = getAuthHeaders();
  const response = await apiClient.get<{ success: boolean; data: CampaignSummary[]; meta: { pagination: { total: number } } }>('/campaigns', { 
    headers,
    params: { page, limit }
  });
  return { campaigns: response.data.data, total: response.data.meta.pagination.total };
}

export async function fetchCampaign(id: string): Promise<CampaignDetail> {
  const headers = await getAuthHeaders();
  const response = await apiClient.get<{ success: boolean; data: CampaignDetail }>(`/campaigns/${id}`, { headers });
  return response.data.data;
}

export async function parseFilePreview(file: File): Promise<ParsePreviewResponse> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('csv', file);
  
  const response = await apiClient.post<{ success: boolean; data: ParsePreviewResponse }>('/campaigns/parse-preview', formData, {
    headers: {
      ...headers,
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60_000, // 60s for large file uploads
  });
  
  return response.data.data;
}

/** Returned by both /send and /schedule — includes what the server skipped. */
export type ScheduleResult = CampaignCreateResult & { scheduledAt: string };

/**
 * Schedule a campaign for future delivery.
 * Uploads the CSV + campaign payload to POST /campaigns/schedule.
 * Returns JSON immediately (no SSE stream) — the cron job fires when the time comes.
 */
export async function scheduleCampaign(
  file: File,
  payload: { subject: string; fromName: string; body: string; scheduledAt: string },
  attachments?: File[]
): Promise<ScheduleResult> {
  const authHeaders = await getAuthHeaders();
  
  const formData = new FormData();
  formData.append('csv', file);
  formData.append('subject', payload.subject);
  formData.append('fromName', payload.fromName);
  formData.append('body', payload.body);
  formData.append('scheduledAt', payload.scheduledAt);
  if (attachments) {
    attachments.forEach(att => formData.append('attachments', att));
  }

  const response = await apiClient.post<{ success: boolean; data: ScheduleResult }>(
    '/campaigns/schedule',
    formData,
    {
      headers: {
        ...authHeaders,
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.data;
}

export type SendNowResult = CampaignCreateResult;

/**
 * Send a campaign immediately — returns JSON right away.
 * The backend processes emails in the background.
 */
export async function sendCampaignNow(
  file: File,
  payload: { subject: string; fromName: string; body: string },
  attachments?: File[]
): Promise<SendNowResult> {
  const authHeaders = await getAuthHeaders();

  const formData = new FormData();
  formData.append('csv', file);
  formData.append('subject', payload.subject);
  formData.append('fromName', payload.fromName);
  formData.append('body', payload.body);
  if (attachments) {
    attachments.forEach(att => formData.append('attachments', att));
  }

  const response = await apiClient.post<{ success: boolean; data: SendNowResult }>(
    '/campaigns/send',
    formData,
    {
      headers: {
        ...authHeaders,
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.data;
}
