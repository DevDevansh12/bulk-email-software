import type { Audience, AudienceContact, AudienceImportResult } from '@saas/shared';

import { apiClient } from './api-client';

/**
 * Get authorization headers from the centralized apiClient.
 * This ensures we always use the current valid token managed by auth.store.
 */
const getAuthHeaders = () => {
  const token = apiClient.defaults.headers.common['Authorization'] as string | undefined;
  return token ? { Authorization: token } : {};
};

export async function fetchAudiences(): Promise<Audience[]> {
  const headers = getAuthHeaders();
  const res = await apiClient.get<{ success: boolean; data: Audience[] }>('/audiences', { headers });
  return res.data.data;
}

export async function createAudience(name: string, description?: string): Promise<Audience> {
  const headers = getAuthHeaders();
  const res = await apiClient.post<{ success: boolean; data: Audience }>('/audiences', { name, description }, { headers });
  return res.data.data;
}

export async function fetchAudienceDetails(id: string): Promise<{ audience: Audience; contacts: AudienceContact[] }> {
  const headers = await getAuthHeaders();
  const res = await apiClient.get<{ success: boolean; data: { audience: Audience; contacts: AudienceContact[] } }>(`/audiences/${id}`, { headers });
  return res.data.data;
}

export async function addContactToAudience(audienceId: string, email: string, name?: string): Promise<AudienceImportResult> {
  const headers = await getAuthHeaders();
  const res = await apiClient.post<{ success: boolean; data: AudienceImportResult }>(`/audiences/${audienceId}/contacts`, { email, name }, { headers });
  return res.data.data;
}

export async function uploadContactsCsvToAudience(audienceId: string, file: File): Promise<AudienceImportResult> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('csv', file);

  const res = await apiClient.post<{ success: boolean; data: AudienceImportResult }>(`/audiences/${audienceId}/contacts`, formData, {
    headers: {
      ...headers,
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60_000,
  });

  return res.data.data;
}

export async function deleteAudience(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  await apiClient.delete(`/audiences/${id}`, { headers });
}
