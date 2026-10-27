import { apiClient } from './api-client';

/**
 * Get authorization headers from the centralized apiClient.
 * This ensures we always use the current valid token managed by auth.store.
 */
const getAuthHeaders = () => {
  const token = apiClient.defaults.headers.common['Authorization'] as string | undefined;
  return token ? { Authorization: token } : {};
};

export async function paraphraseText(text: string, tone: string): Promise<string> {
  const headers = getAuthHeaders();
  const response = await apiClient.post<{ success: boolean; data: { paraphrasedText: string } }>(
    '/ai/paraphrase',
    { text, tone },
    { headers }
  );
  return response.data.data.paraphrasedText;
}
