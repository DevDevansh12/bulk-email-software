/**
 * Metric helpers shared by the server analytics service and the dashboard so
 * both compute rates with the same denominators.
 */
import type { WhatsAppCampaignSummary } from '../types/whatsapp.types.js';

/**
 * Percentage rounded to one decimal place, or null when the denominator is 0.
 * Use only for subset metrics (numerator ⊆ denominator); the result is clamped
 * to 100 as a guard against counters drifting out of sync.
 */
export function boundedRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const pct = (Math.max(0, numerator) / denominator) * 100;
  return Math.round(Math.min(pct, 100) * 10) / 10;
}

export interface WhatsAppChannelTotals {
  campaigns: number;
  simulatedCampaigns: number;
  recipients: number;
  /** Accepted by the Meta API */
  sent: number;
  /** Confirmed by webhook */
  delivered: number;
  read: number;
  failed: number;
  activeCampaigns: number;
  /** delivered / sent */
  deliveryRate: number | null;
  /** read / delivered */
  readRate: number | null;
}

/** Aggregate WhatsApp campaigns. Simulated campaigns are excluded from every real metric. */
export function summarizeWhatsAppCampaigns(campaigns: WhatsAppCampaignSummary[]): WhatsAppChannelTotals {
  const totals = {
    campaigns: 0,
    simulatedCampaigns: 0,
    recipients: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    activeCampaigns: 0,
  };

  for (const c of campaigns) {
    if (c.isSimulation) {
      totals.simulatedCampaigns++;
      continue;
    }
    totals.campaigns++;
    totals.recipients += c.totalRecipients || 0;
    totals.sent += c.sentCount || 0;
    totals.delivered += c.deliveredCount || 0;
    totals.read += c.readCount || 0;
    totals.failed += c.failedCount || 0;
    if (c.status === 'sending' || c.status === 'pending') totals.activeCampaigns++;
  }

  return {
    ...totals,
    deliveryRate: boundedRate(totals.delivered, totals.sent),
    readRate: boundedRate(totals.read, totals.delivered),
  };
}
