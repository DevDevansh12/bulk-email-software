import { apiClient } from './api-client';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface SaveEmailTemplatePayload {
  id?: string;
  name: string;
  subject: string;
  body: string;
}

/**
 * Get authorization headers from the centralized apiClient.
 * This ensures we always use the current valid token managed by auth.store.
 */
const getAuthHeaders = () => {
  const token = apiClient.defaults.headers.common['Authorization'] as string | undefined;
  return token ? { Authorization: token } : {};
};

export async function fetchTemplates(): Promise<EmailTemplate[]> {
  const headers = getAuthHeaders();
  const response = await apiClient.get<{ success: boolean; data: EmailTemplate[] }>('/templates', { headers });
  return response.data.data;
}

export async function saveTemplate(payload: SaveEmailTemplatePayload): Promise<EmailTemplate> {
  const headers = await getAuthHeaders();
  const response = await apiClient.post<{ success: boolean; data: EmailTemplate }>('/templates', payload, { headers });
  return response.data.data;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const headers = await getAuthHeaders();
  await apiClient.delete(`/templates/${id}`, { headers });
  return true;
}
