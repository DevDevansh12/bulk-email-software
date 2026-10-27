import { apiClient } from './api-client';
import type { AnalyticsOverview } from '@saas/shared';

/**
 * Get authorization headers from the centralized apiClient.
 * This ensures we always use the current valid token managed by auth.store.
 */
const getAuthHeaders = () => {
  const token = apiClient.defaults.headers.common['Authorization'] as string | undefined;
  return token ? { Authorization: token } : {};
};

export async function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  const headers = getAuthHeaders();
  const res = await apiClient.get<{ success: boolean; data: AnalyticsOverview }>('/analytics/overview', { headers });
  return res.data.data;
}
