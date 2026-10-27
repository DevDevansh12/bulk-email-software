/**
 * Pure analytics calculations (no I/O) — unit tested.
 * Definitions are documented on AnalyticsOverview in @saas/shared.
 */
import type { AnalyticsOverview } from '@saas/shared';
import { boundedRate } from '@saas/shared';

const ACTIVITY_DAYS = 14;

export interface RecipientTracking {
  open_count: number | null;
  click_count: number | null;
  opened_at: string | null;
  clicked_at: string | null;
}

export interface AnalyticsCampaignRow {
  id: string;
  subject: string;
  sent_count: number | null;
  failed_count: number | null;
  total_opens: number | null;
  total_clicks: number | null;
  created_at: string;
  started_at: string | null;
  campaign_recipients: RecipientTracking[] | null;
}

/** Last `days` UTC dates (oldest first) as YYYY-MM-DD. */
export function lastUtcDays(days: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function computeAnalyticsOverview(campaigns: AnalyticsCampaignRow[], now: Date = new Date()): AnalyticsOverview {
  let totalSent = 0;
  let totalFailed = 0;
  let totalOpens = 0;
  let totalClicks = 0;
  let uniqueOpens = 0;
  let uniqueClicks = 0;

  const days = lastUtcDays(ACTIVITY_DAYS, now);
  const activity = new Map(days.map((d) => [d, { sent: 0, failed: 0, uniqueOpens: 0, uniqueClicks: 0 }]));
  const topCampaigns: AnalyticsOverview['topCampaigns'] = [];

  for (const c of campaigns) {
    const sent = c.sent_count || 0;
    const failed = c.failed_count || 0;
    const recipients = c.campaign_recipients || [];

    const opened = recipients.filter((r) => r.opened_at || (r.open_count || 0) > 0).length;
    const clicked = recipients.filter((r) => r.clicked_at || (r.click_count || 0) > 0).length;
    const recipientOpens = recipients.reduce((acc, r) => acc + (r.open_count || (r.opened_at ? 1 : 0)), 0);
    const recipientClicks = recipients.reduce((acc, r) => acc + (r.click_count || (r.clicked_at ? 1 : 0)), 0);

    totalSent += sent;
    totalFailed += failed;
    totalOpens += Math.max(c.total_opens || 0, recipientOpens);
    totalClicks += Math.max(c.total_clicks || 0, recipientClicks);
    uniqueOpens += opened;
    uniqueClicks += clicked;

    if (sent > 0) {
      topCampaigns.push({
        id: c.id,
        subject: c.subject,
        sentCount: sent,
        uniqueOpens: opened,
        uniqueClicks: clicked,
        openRate: boundedRate(opened, sent),
        clickRate: boundedRate(clicked, sent),
      });
    }

    const dateKey = new Date(c.started_at ?? c.created_at).toISOString().slice(0, 10);
    const bucket = activity.get(dateKey);
    if (bucket) {
      bucket.sent += sent;
      bucket.failed += failed;
      bucket.uniqueOpens += opened;
      bucket.uniqueClicks += clicked;
    }
  }

  // Rank by open rate, then by volume so a 1-recipient test doesn't outrank real campaigns on ties
  topCampaigns.sort((a, b) => (b.openRate ?? 0) - (a.openRate ?? 0) || b.sentCount - a.sentCount);

  return {
    totalSent,
    totalFailed,
    totalOpens,
    totalClicks,
    uniqueOpens,
    uniqueClicks,
    openRate: boundedRate(uniqueOpens, totalSent),
    clickRate: boundedRate(uniqueClicks, totalSent),
    ctor: boundedRate(uniqueClicks, uniqueOpens),
    failureRate: boundedRate(totalFailed, totalSent + totalFailed),
    recentActivity: days.map((date) => ({ date, ...activity.get(date)! })),
    topCampaigns: topCampaigns.slice(0, 5),
  };
}

