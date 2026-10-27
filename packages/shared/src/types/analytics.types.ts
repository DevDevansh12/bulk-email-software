/**
 * Email analytics. Definitions (keep in sync with analytics.service.ts):
 *   sent          = messages accepted by the SMTP server (not proof of inbox delivery)
 *   failed        = messages the SMTP server rejected or that could not be attempted
 *   uniqueOpens   = recipients with at least one tracked open (image pixel — an estimate;
 *                   privacy proxies can inflate it, image blocking can deflate it)
 *   uniqueClicks  = recipients with at least one tracked click
 *   openRate      = uniqueOpens / sent × 100
 *   clickRate     = uniqueClicks / sent × 100
 *   ctor          = uniqueClicks / uniqueOpens × 100
 *   failureRate   = failed / (sent + failed) × 100
 * All rates are bounded 0–100 and null when the denominator is 0.
 */
export interface AnalyticsOverview {
  totalSent: number;
  totalFailed: number;
  /** Total pixel loads / link clicks (can exceed sent — use unique counts for rates) */
  totalOpens: number;
  totalClicks: number;
  uniqueOpens: number;
  uniqueClicks: number;
  openRate: number | null;
  clickRate: number | null;
  ctor: number | null;
  failureRate: number | null;
  /** One entry per UTC day for the last `days` days (zero-filled), keyed by campaign start date */
  recentActivity: {
    date: string; // YYYY-MM-DD (UTC)
    sent: number;
    failed: number;
    uniqueOpens: number;
    uniqueClicks: number;
  }[];
  topCampaigns: {
    id: string;
    subject: string;
    sentCount: number;
    uniqueOpens: number;
    uniqueClicks: number;
    openRate: number | null;
    clickRate: number | null;
  }[];
}
