/**
 * Analytics Service — email open/click rates and delivery timeline.
 *
 * Rates use UNIQUE recipients (opened/clicked at least once) over messages
 * accepted by SMTP, so they are bounded 0–100%. Raw pixel loads/clicks are
 * reported separately as totals. See analytics.metrics.ts.
 */
import type { AnalyticsOverview } from '@saas/shared';

import { supabaseAdmin } from '../../config/supabase.js';
import { createError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';

import { computeAnalyticsOverview, type AnalyticsCampaignRow } from './analytics.metrics.js';

export async function getAnalyticsOverview(userId: string): Promise<AnalyticsOverview> {
  const { data: campaigns, error } = await supabaseAdmin
    .from('campaigns')
    .select(`
      id, subject, sent_count, failed_count, total_opens, total_clicks, created_at, started_at,
      campaign_recipients ( open_count, click_count, opened_at, clicked_at )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ dbError: error.message, userId }, 'Failed to fetch analytics');
    throw createError.internal('Failed to fetch analytics');
  }

  const rows: AnalyticsCampaignRow[] = campaigns || [];
  return computeAnalyticsOverview(rows);
}
