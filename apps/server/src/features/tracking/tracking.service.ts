/**
 * Tracking Service — Email Opens & Link Clicks.
 *
 * Open Tracking:
 * - Serves a 1x1 transparent GIF buffer
 * - Records recipient opened_at timestamp & increments campaign open count
 *
 * Click Tracking:
 * - Logs click event for recipient
 * - 302 redirects to target URL
 */
import { supabaseAdmin } from '../../config/supabase.js';
import { logger } from '../../lib/logger.js';

// 1x1 Transparent GIF Buffer
export const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

type TrackedEvent = 'open' | 'click';

const EVENT_COLUMNS = {
  open: { firstAt: 'opened_at', count: 'open_count', total: 'total_opens', unique: 'unique_opens' },
  click: { firstAt: 'clicked_at', count: 'click_count', total: 'total_clicks', unique: 'unique_clicks' },
} as const;

/**
 * Record an open/click.
 * - opened_at/clicked_at keep the FIRST event time; the conditional update
 *   (WHERE first_at IS NULL) is atomic, so only one request counts as "first".
 * - unique_* campaign counters are recounted from recipient rows, so repeated
 *   or concurrent events can never inflate them past the number of recipients.
 * - total_* / *_count stay raw event counters (they can exceed recipients).
 */
async function recordEvent(event: TrackedEvent, campaignId: string, recipientId: string): Promise<void> {
  const cols = EVENT_COLUMNS[event];
  const now = new Date().toISOString();

  const { data: recipient, error: readErr } = await supabaseAdmin
    .from('campaign_recipients')
    .select(`id, ${cols.count}`)
    .eq('id', recipientId)
    .eq('campaign_id', campaignId)
    .maybeSingle();

  if (readErr || !recipient) return; // unknown/forged ids are ignored silently

  const { data: firstRows } = await supabaseAdmin
    .from('campaign_recipients')
    .update({ [cols.firstAt]: now })
    .eq('id', recipientId)
    .is(cols.firstAt, null)
    .select('id');
  const isFirst = (firstRows?.length ?? 0) > 0;

  await supabaseAdmin
    .from('campaign_recipients')
    .update({ [cols.count]: (((recipient as Record<string, unknown>)[cols.count] as number | null) || 0) + 1 })
    .eq('id', recipientId);

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select(cols.total)
    .eq('id', campaignId)
    .maybeSingle();

  const campaignUpdate: Record<string, number> = {
    [cols.total]: (((campaign as Record<string, unknown> | null)?.[cols.total] as number | null) || 0) + 1,
  };

  if (isFirst) {
    const { count, error } = await supabaseAdmin
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .not(cols.firstAt, 'is', null);
    if (!error && count !== null) campaignUpdate[cols.unique] = count;
  }

  const { error: updateErr } = await supabaseAdmin.from('campaigns').update(campaignUpdate).eq('id', campaignId);
  if (updateErr && isFirst) {
    // unique_* columns missing (migration not applied) — keep the raw counter working
    await supabaseAdmin.from('campaigns').update({ [cols.total]: campaignUpdate[cols.total] }).eq('id', campaignId);
  }
}

export async function recordOpen(campaignId: string, recipientId: string): Promise<void> {
  try {
    await recordEvent('open', campaignId, recipientId);
    logger.debug({ campaignId, recipientId }, 'Email open recorded');
  } catch (error) {
    logger.error({ error, campaignId, recipientId }, 'Failed to record email open');
  }
}

export async function recordClick(campaignId: string, recipientId: string): Promise<void> {
  try {
    await recordEvent('click', campaignId, recipientId);
    logger.debug({ campaignId, recipientId }, 'Link click recorded');
  } catch (error) {
    logger.error({ error, campaignId, recipientId }, 'Failed to record link click');
  }
}
