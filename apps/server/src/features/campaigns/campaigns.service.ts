/**
 * Campaigns service — bulk email sending.
 *
 * Flow:
 * 1. Parse CSV/Excel → validate + de-duplicate (recipient-list.ts — same rules as preview)
 * 2. Store the campaign and one row per unique recipient (server-generated ids)
 * 3. A headless sender (immediately, or the cron for scheduled campaigns) locks the
 *    campaign, resolves the SMTP provider explicitly, runs a pre-flight check, then
 *    sends in batches and records every result against the recipient's id
 * 4. The client polls GET /campaigns/:id for progress
 */
import { randomUUID } from 'node:crypto';

import type {
  CampaignDetail,
  CampaignStatus,
  CampaignSummary,
  DashboardStats,
  ParsePreviewResponse,
} from '@saas/shared';
import { boundedRate } from '@saas/shared';
import type { Transporter } from 'nodemailer';

import { env } from '../../config/env.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { createError } from '../../lib/app-error.js';
import { emailService, isSystemSmtpConfigured } from '../../lib/email.service.js';
import { escapeHtml } from '../../lib/html-escape.js';
import { logger } from '../../lib/logger.js';
import { readSpreadsheet } from '../../lib/spreadsheet.js';
import { classifySmtpError } from '../smtp/smtp-errors.js';
import { selectSmtpProvider } from '../smtp/smtp-provider.js';
import { buildTransporter, lookupSmtpSettingsWithPassword, sendMailWithRetry } from '../smtp/smtp.service.js';

import { buildEmailRecipients, type BuiltRecipient } from './recipient-list.js';

const BATCH_SIZE = 10;      // emails per batch
const BATCH_DELAY_MS = 500; // ms between batches — be nice to SMTP servers
const RECIPIENT_PAGE_SIZE = 500; // stays below PostgREST's default 1000-row response cap
const INSERT_CHUNK = 500;

export interface CampaignPayload {
  subject: string;
  fromName: string;
  body: string; // HTML or plain text
  scheduledAt?: string; // ISO 8601 — if set, campaign is deferred
  attachments?: any[];
}

export interface CronProcessResult {
  campaignId: string;
  userId: string;
  subject: string;
  total: number;
  sent: number;
  failed: number;
}

export interface ParsedRecipients {
  recipients: BuiltRecipient[];
  skipped: { invalid: number; duplicates: number };
}

// ── File parsing (preview + send share one implementation) ────────────────────

export function parseFilePreview(buffer: Buffer, filename: string, fileSize?: number): ParsePreviewResponse {
  const sheet = readSpreadsheet(buffer, filename);
  const result = buildEmailRecipients(sheet);

  return {
    recipients: result.preview,
    totalValid: result.recipients.length,
    totalInvalid: result.invalidCount,
    columns: sheet.headers,
    fileInfo: {
      name: filename,
      size: fileSize || buffer.length,
      rowCount: sheet.rows.length,
      type: sheet.type,
    },
    duplicateCount: result.duplicates.length,
    duplicates: result.duplicates,
    columnMappings: result.columnMappings,
  };
}

/**
 * Server-side validation for send/schedule — never trust the client preview.
 * Throws a 400 when there is nothing sendable.
 */
export function parseRecipientsForSend(buffer: Buffer, filename: string): ParsedRecipients {
  const sheet = readSpreadsheet(buffer, filename);
  const result = buildEmailRecipients(sheet);

  if (!result.emailColumn) {
    throw createError.badRequest(
      'Could not find an email column. Add a header such as "email" or "email_address" to the first row.'
    );
  }
  if (result.recipients.length === 0) {
    throw createError.badRequest(
      `No valid recipients found (${result.invalidCount} invalid, ${result.duplicates.length} duplicate).`
    );
  }

  return {
    recipients: result.recipients,
    skipped: { invalid: result.invalidCount, duplicates: result.duplicates.length },
  };
}

// ── Database Operations ───────────────────────────────────────────────────────

/**
 * Create a campaign and its recipients, then mark it 'scheduled' so the
 * headless sender (now) or the cron (later) picks it up.
 *
 * The row stays 'pending' until every recipient is stored, so the cron can
 * never start a campaign whose recipient list is only partly written.
 */
export async function createCampaign(
  userId: string,
  payload: CampaignPayload,
  recipients: BuiltRecipient[],
  scheduledAt: string = new Date().toISOString()
): Promise<{ campaignId: string }> {
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .insert({
      user_id: userId,
      subject: payload.subject,
      sender_name: payload.fromName,
      body: payload.body,
      status: 'pending',
      total_recipients: recipients.length,
      attachments: payload.attachments?.length ? payload.attachments : null,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.error({ dbError: error?.message, userId }, 'Failed to create campaign record');
    throw createError.internal('Failed to create campaign');
  }

  const campaignId = data.id as string;

  for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
    const chunk = recipients.slice(i, i + INSERT_CHUNK).map((r) => ({
      id: randomUUID(), // unique id per recipient — status updates never key on the email string
      campaign_id: campaignId,
      email: r.email,
      name: r.name || null,
      merge_data: r.mergeData,
      status: 'pending',
    }));

    const { error: insertError } = await supabaseAdmin.from('campaign_recipients').insert(chunk);
    if (insertError) {
      logger.error({ dbError: insertError.message, campaignId }, 'Failed to store campaign recipients');
      // Don't leave a half-written campaign behind (recipients cascade)
      const { error: cleanupError } = await supabaseAdmin.from('campaigns').delete().eq('id', campaignId);
      if (cleanupError) {
        await supabaseAdmin
          .from('campaigns')
          .update({ status: 'failed', error_message: 'Recipient list could not be stored' })
          .eq('id', campaignId);
      }
      throw createError.internal(
        'Failed to store campaign recipients. Nothing was sent. If this persists, make sure the latest database migration has been applied.'
      );
    }
  }

  const { error: scheduleError } = await supabaseAdmin
    .from('campaigns')
    .update({ status: 'scheduled', scheduled_at: scheduledAt })
    .eq('id', campaignId);

  if (scheduleError) {
    logger.error({ dbError: scheduleError.message, campaignId }, 'Failed to queue campaign');
    throw createError.internal('Campaign was created but could not be queued for sending.');
  }

  logger.info({ userId, campaignId, scheduledAt, recipientCount: recipients.length }, 'Campaign created');
  return { campaignId };
}

/** Columns of the campaigns table we read (tracking columns may be absent before the migration). */
interface CampaignRow {
  id: string;
  subject: string;
  sender_name: string;
  status: CampaignStatus;
  total_recipients: number;
  sent_count: number | null;
  failed_count: number | null;
  total_opens?: number | null;
  total_clicks?: number | null;
  unique_opens?: number | null;
  unique_clicks?: number | null;
  error_message?: string | null;
  created_at: string;
  scheduled_at?: string | null;
  started_at?: string;
  completed_at?: string;
}

interface CampaignRecipientRow {
  id: string;
  email: string;
  name?: string;
  status: CampaignDetail['recipients'][number]['status'];
  error?: string;
  sent_at?: string;
  opened_at?: string | null;
  clicked_at?: string | null;
  open_count?: number | null;
  click_count?: number | null;
}

function rowToSummary(c: CampaignRow, uniqueOverride?: { opens: number; clicks: number }): CampaignSummary {
  const sentCount = c.sent_count || 0;
  const uniqueOpens = uniqueOverride?.opens ?? (typeof c.unique_opens === 'number' ? c.unique_opens : null);
  const uniqueClicks = uniqueOverride?.clicks ?? (typeof c.unique_clicks === 'number' ? c.unique_clicks : null);

  return {
    id: c.id,
    subject: c.subject,
    senderName: c.sender_name,
    status: c.status,
    totalRecipients: c.total_recipients,
    sentCount,
    failedCount: c.failed_count || 0,
    totalOpens: c.total_opens || 0,
    totalClicks: c.total_clicks || 0,
    uniqueOpens,
    uniqueClicks,
    openRate: uniqueOpens === null ? null : boundedRate(uniqueOpens, sentCount),
    clickRate: uniqueClicks === null ? null : boundedRate(uniqueClicks, sentCount),
    errorMessage: c.error_message ?? null,
    createdAt: c.created_at,
    scheduledAt: c.scheduled_at ?? undefined,
    ...(c.started_at && { startedAt: c.started_at }),
    ...(c.completed_at && { completedAt: c.completed_at }),
  };
}

export async function getCampaigns(userId: string, page: number, limit: number): Promise<{ campaigns: CampaignSummary[], total: number }> {
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabaseAdmin
    .from('campaigns')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error({ dbError: error.message }, 'Failed to fetch campaigns');
    throw createError.internal('Failed to fetch campaigns');
  }

  return { campaigns: ((data || []) as CampaignRow[]).map((c) => rowToSummary(c)), total: count || 0 };
}

export async function getCampaignById(campaignId: string, userId: string): Promise<CampaignDetail> {
  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .select(`
      *,
      campaign_recipients (
        id, email, name, status, error, sent_at, opened_at, clicked_at, open_count, click_count
      )
    `)
    .eq('id', campaignId)
    .eq('user_id', userId)
    .single();

  if (error || !campaign) {
    throw createError.notFound('Campaign');
  }

  const recipients: CampaignRecipientRow[] = campaign.campaign_recipients || [];
  const uniqueOpens = recipients.filter((r) => r.opened_at || (r.open_count || 0) > 0).length;
  const uniqueClicks = recipients.filter((r) => r.clicked_at || (r.click_count || 0) > 0).length;

  return {
    ...rowToSummary(campaign, { opens: uniqueOpens, clicks: uniqueClicks }),
    body: campaign.body,
    recipients: recipients.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      status: r.status,
      error: r.error,
      sentAt: r.sent_at,
      openedAt: r.opened_at ?? undefined,
      clickedAt: r.clicked_at ?? undefined,
      openCount: r.open_count || 0,
      clickCount: r.click_count || 0,
    })),
  };
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  // select('*') tolerates databases where the tracking columns are not migrated yet
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    logger.error({ dbError: error.message, userId }, 'Failed to fetch dashboard stats');
    throw createError.internal('Failed to fetch stats');
  }

  const campaignsByStatus: Record<CampaignStatus, number> = {
    pending: 0, scheduled: 0, sending: 0, completed: 0, failed: 0,
  };
  let totalEmailsSent = 0;
  let totalEmailsFailed = 0;
  let totalRecipients = 0;
  let uniqueOpens: number | null = null;
  let uniqueClicks: number | null = null;

  for (const c of data || []) {
    const status = c.status as CampaignStatus;
    if (status in campaignsByStatus) campaignsByStatus[status]++;
    totalEmailsSent += c.sent_count || 0;
    totalEmailsFailed += c.failed_count || 0;
    totalRecipients += c.total_recipients || 0;
    if (typeof c.unique_opens === 'number') uniqueOpens = (uniqueOpens ?? 0) + c.unique_opens;
    if (typeof c.unique_clicks === 'number') uniqueClicks = (uniqueClicks ?? 0) + c.unique_clicks;
  }

  return {
    totalCampaigns: data?.length || 0,
    totalEmailsSent,
    totalEmailsFailed,
    totalRecipients,
    totalEmailsPending: Math.max(0, totalRecipients - totalEmailsSent - totalEmailsFailed),
    campaignsByStatus,
    uniqueOpens,
    uniqueClicks,
  };
}


// ── Sending ───────────────────────────────────────────────────────────────────

/**
 * Replace {{variableName}} merge variables with recipient data.
 * `escape` must be true for HTML bodies and false for plain-text subjects
 * (escaping a subject would show "&amp;" in the inbox).
 */
export function replaceVariables(
  text: string,
  data: Record<string, string>,
  options: { escape: boolean }
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
    const key = varName.toLowerCase();
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') {
      return options.escape ? escapeHtml(String(value)) : String(value);
    }
    // Special fallback for 'name' variable
    if (key === 'name') return 'there';
    // Return original placeholder if not found
    return match;
  });
}

function buildHtml(
  body: string,
  mergeData: Record<string, string>,
  campaignId: string,
  recipientId: string
): string {
  // Replace merge variables in body (HTML-escaped)
  let bodyContent = replaceVariables(body, mergeData, { escape: true });

  const serverUrl = env.SERVER_URL || `http://localhost:${env.PORT}`;
  const trackingBase = `${serverUrl}/api/${env.API_VERSION}/tracking`;

  const isHtml = /<[a-z][\s\S]*>/i.test(bodyContent);
  if (!isHtml) {
    bodyContent = `<p>${bodyContent.replace(/\n/g, '<br/>')}</p>`;
  }

  // Rewrite links for click tracking: <a href="http..."> -> <a href="http://localhost:5000/api/v1/tracking/click/campaignId/recipientId?url=http...">
  bodyContent = bodyContent.replace(/<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"']+)["']/gi, (_match, url) => {
    const trackingClickUrl = `${trackingBase}/click/${campaignId}/${recipientId}?url=${encodeURIComponent(url)}`;
    return `<a href="${trackingClickUrl}"`;
  });

  // Inject open tracking pixel at the bottom of the body
  const openPixelTag = `<img src="${trackingBase}/open/${campaignId}/${recipientId}.gif" width="1" height="1" alt="" style="display:none;width:1px;height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;" />`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: #f8fafc;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f8fafc;
      padding-top: 24px;
      padding-bottom: 24px;
    }
    .content-table {
      max-width: 600px;
      width: 100%;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      border-collapse: separate;
    }
    .content-td {
      padding: 32px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1e293b;
      text-align: left;
    }
    p {
      margin-top: 0;
      margin-bottom: 16px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 0;
      margin-bottom: 16px;
      color: #0f172a;
      font-weight: 600;
    }
    h1 { font-size: 24px; line-height: 1.25; }
    h2 { font-size: 20px; line-height: 1.3; }
    h3 { font-size: 18px; line-height: 1.35; }
    a {
      color: #4f46e5;
      text-decoration: underline;
    }
    ul, ol {
      margin-top: 0;
      margin-bottom: 16px;
      padding-left: 24px;
    }
    li {
      margin-bottom: 8px;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <!--[if (gte mso 9)|(IE)]>
    <table width="600" align="center" style="border-spacing:0;font-family:sans-serif;color:#1e293b;">
    <tr>
    <td style="padding:0;">
    <![endif]-->
    <table class="content-table" align="center" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td class="content-td">
          <div style="font-size: 16px; line-height: 1.6; color: #1e293b;">
            ${bodyContent}
          </div>
        </td>
      </tr>
    </table>
    <!--[if (gte mso 9)|(IE)]>
    </td>
    </tr>
    </table>
    <![endif]-->
  </div>
  ${openPixelTag}
</body>
</html>`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ResolvedSender {
  kind: 'user' | 'system';
  transporter: Transporter;
  fromAddress: string;
  fromName?: string | undefined;
  /** Only user transporters are owned by the campaign; the system one is shared */
  close: () => void;
}

/** Explicit provider selection — a failed lookup never falls back to another server. */
async function resolveSender(userId: string): Promise<{ sender: ResolvedSender } | { error: string }> {
  const lookup = await lookupSmtpSettingsWithPassword(userId);
  const selection = selectSmtpProvider(lookup, {
    configured: isSystemSmtpConfigured(),
    isProduction: env.NODE_ENV === 'production',
  });

  if (selection.kind === 'unavailable') return { error: selection.reason };

  if (selection.kind === 'user') {
    const transporter = buildTransporter(selection.config);
    return {
      sender: {
        kind: 'user',
        transporter,
        fromAddress: selection.config.fromEmail,
        fromName: selection.config.fromName || undefined,
        close: () => transporter.close(),
      },
    };
  }

  try {
    const transporter = await emailService.getSystemTransporter();
    return { sender: { kind: 'system', transporter, fromAddress: env.EMAIL_FROM, close: () => undefined } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'System SMTP is unavailable' };
  }
}

interface PendingRecipientRow {
  id: string;
  email: string;
  name: string | null;
  merge_data: Record<string, string> | null;
}

/** Keyset pagination over pending recipients (offsets would shift as rows are updated). */
async function fetchPendingRecipients(campaignId: string, afterId: string | null): Promise<PendingRecipientRow[]> {
  let query = supabaseAdmin
    .from('campaign_recipients')
    .select('id, email, name, merge_data')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('id', { ascending: true })
    .limit(RECIPIENT_PAGE_SIZE);
  if (afterId) query = query.gt('id', afterId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load recipients: ${error.message}`);
  return data || [];
}

/** Mark every still-pending recipient failed with one reason (campaign-level failures). */
async function failPendingRecipients(campaignId: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('campaign_recipients')
    .update({ status: 'failed', error: reason })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');
  if (error) logger.error({ dbError: error.message, campaignId }, 'Failed to mark pending recipients as failed');
}

async function countRecipients(campaignId: string, status: 'sent' | 'failed'): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', status);
  return error ? null : count ?? 0;
}

/** Final campaign status computed from the stored recipient rows (source of truth). */
async function finalizeCampaign(
  campaignId: string,
  fallback: { sent: number; failed: number },
  errorMessage: string | null
): Promise<{ sent: number; failed: number }> {
  const sent = (await countRecipients(campaignId, 'sent')) ?? fallback.sent;
  const failed = (await countRecipients(campaignId, 'failed')) ?? fallback.failed;

  const { error } = await supabaseAdmin
    .from('campaigns')
    .update({
      status: sent === 0 && failed > 0 ? 'failed' : 'completed',
      sent_count: sent,
      failed_count: failed,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', campaignId);

  if (error) {
    logger.error({ dbError: error.message, campaignId }, 'Failed to store final campaign status');
  }
  return { sent, failed };
}

/**
 * Send a campaign without SSE — used for immediate sends (fire-and-forget)
 * and by the cron job for scheduled campaigns. All progress goes to the database.
 */
export async function sendCampaignHeadless(campaignId: string, userId: string): Promise<CronProcessResult> {
  // Lock atomically — prevents double-processing by cron + immediate trigger.
  // Only 'scheduled' is claimable: 'pending' means the recipient list is still being written.
  const { data: locked, error: lockErr } = await supabaseAdmin
    .from('campaigns')
    .update({ status: 'sending', started_at: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .select('id, subject, sender_name, body, attachments, total_recipients');

  const campaign = locked?.[0];
  if (lockErr || !campaign) {
    logger.info({ campaignId, dbError: lockErr?.message }, 'Headless send: campaign already locked/processing — skipping');
    return { campaignId, userId, subject: '', total: 0, sent: 0, failed: 0 };
  }

  const payload: CampaignPayload = {
    subject: campaign.subject,
    fromName: campaign.sender_name,
    body: campaign.body,
    attachments: campaign.attachments || undefined,
  };
  const total: number = campaign.total_recipients || 0;
  const log = logger.child({ campaignId, userId });

  // ── Resolve SMTP provider explicitly ──────────────────────────────────────
  const resolved = await resolveSender(userId);
  if ('error' in resolved) {
    log.error({ reason: resolved.error }, 'Campaign aborted: no usable SMTP provider');
    await failPendingRecipients(campaignId, resolved.error);
    const counts = await finalizeCampaign(campaignId, { sent: 0, failed: total }, resolved.error);
    return { campaignId, userId, subject: payload.subject, total, ...counts };
  }
  const sender = resolved.sender;

  try {
    // Pre-flight: fail fast with one clear reason instead of N identical errors
    // (and avoid hammering a server with bad credentials, which can lock the account)
    try {
      await sender.transporter.verify();
    } catch (err) {
      const info = classifySmtpError(err);
      const reason = `${sender.kind === 'user' ? 'Your SMTP server' : 'System SMTP'}: ${info.message}`;
      log.error(
        { provider: sender.kind, category: info.category, code: info.code, responseCode: info.responseCode },
        'SMTP pre-flight check failed'
      );
      await failPendingRecipients(campaignId, reason);
      const counts = await finalizeCampaign(campaignId, { sent: 0, failed: total }, reason);
      return { campaignId, userId, subject: payload.subject, total, ...counts };
    }

    log.info({ provider: sender.kind, total }, 'Campaign sending started');

    let sent = 0;
    let failed = 0;
    let persistenceErrors = 0;
    let abortReason: string | null = null;
    let lastId: string | null = null;

    pages: for (;;) {
      const page = await fetchPendingRecipients(campaignId, lastId);
      if (page.length === 0) break;
      lastId = page[page.length - 1]!.id;

      for (let i = 0; i < page.length; i += BATCH_SIZE) {
        if (abortReason) break pages;
        const batch = page.slice(i, i + BATCH_SIZE);

        await Promise.allSettled(
          batch.map(async (recipient) => {
            const mergeData: Record<string, string> = {
              ...(recipient.merge_data ?? {}),
              email: recipient.email,
              ...(recipient.name ? { name: recipient.name } : {}),
            };
            let update: Record<string, unknown>;

            try {
              await sendMailWithRetry(sender.transporter, {
                // The campaign's From Name wins; the SMTP profile's name is the fallback
                from: { name: payload.fromName || sender.fromName || 'Bulk Email Platform', address: sender.fromAddress },
                to: recipient.email,
                subject: replaceVariables(payload.subject, mergeData, { escape: false }),
                html: buildHtml(payload.body, mergeData, campaignId, recipient.id),
                attachments: payload.attachments,
              });
              sent++;
              update = { status: 'sent', sent_at: new Date().toISOString(), error: null };
            } catch (err) {
              failed++;
              const info = classifySmtpError(err);
              update = { status: 'failed', error: info.message };
              log.warn(
                { recipientId: recipient.id, category: info.category, code: info.code, responseCode: info.responseCode },
                'Failed to send campaign email'
              );
              // Credentials stopped working mid-campaign: stop instead of failing every remaining recipient
              if (info.category === 'auth') abortReason = `Not attempted — campaign stopped: ${info.message}`;
            }

            const { error } = await supabaseAdmin.from('campaign_recipients').update(update).eq('id', recipient.id);
            if (error) {
              persistenceErrors++;
              log.error({ recipientId: recipient.id, dbError: error.message }, 'Failed to record recipient status');
            }
          })
        );

        await sleep(BATCH_DELAY_MS);
      }
    }

    if (abortReason) await failPendingRecipients(campaignId, abortReason);

    const errorMessage =
      abortReason ??
      (persistenceErrors > 0
        ? `${persistenceErrors} delivery result(s) could not be saved; counts may be incomplete.`
        : null);
    const counts = await finalizeCampaign(campaignId, { sent, failed }, errorMessage);
    log.info({ total, ...counts, persistenceErrors }, 'Campaign send complete');
    return { campaignId, userId, subject: payload.subject, total, ...counts };
  } catch (err) {
    // Unexpected failure (e.g. recipients could not be loaded) — record it instead of leaving 'sending'
    const reason = err instanceof Error ? err.message : 'Unexpected error while sending';
    log.error({ err }, 'Campaign send crashed');
    await failPendingRecipients(campaignId, `Not sent: ${reason}`);
    const counts = await finalizeCampaign(campaignId, { sent: 0, failed: 0 }, reason);
    return { campaignId, userId, subject: payload.subject, total, ...counts };
  } finally {
    sender.close();
  }
}

/**
 * Find all campaigns due for sending (status='scheduled', scheduled_at <= now())
 * and send each one headlessly. Called by the cron route every minute.
 *
 * Returns a summary so the cron endpoint can log and respond with meaningful data.
 */
export async function processScheduledCampaigns(): Promise<{
  processed: number;
  results: CronProcessResult[];
}> {
  // Fetch all due scheduled campaigns (use service role — bypasses RLS)
  const { data: dueCampaigns, error } = await supabaseAdmin
    .from('campaigns')
    .select('id, user_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) {
    logger.error({ dbError: error.message }, 'Cron: failed to fetch scheduled campaigns');
    throw createError.internal('Failed to query scheduled campaigns');
  }

  if (!dueCampaigns || dueCampaigns.length === 0) {
    return { processed: 0, results: [] };
  }

  logger.info({ count: dueCampaigns.length }, 'Cron: processing scheduled campaigns');

  const results: CronProcessResult[] = [];
  for (const campaign of dueCampaigns) {
    // sendCampaignHeadless records its own failures; an empty subject means another worker held the lock
    const result = await sendCampaignHeadless(campaign.id, campaign.user_id);
    if (result.subject) results.push(result);
  }

  return { processed: results.length, results };
}
