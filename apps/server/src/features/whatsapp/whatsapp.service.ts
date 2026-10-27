/**
 * WhatsApp Service — Meta WhatsApp Cloud API Integration.
 *
 * Handles:
 * 1. Credentials (user's saved config, else system env) + a live Meta health check
 * 2. Message templates synced from Meta (only Meta-APPROVED templates are sendable)
 * 3. Campaign creation from a server-validated recipient list (whatsapp-recipients.ts)
 * 4. Dispatch with per-recipient results persisted by recipient id
 * 5. Webhook status processing with idempotent, recomputed counters
 *
 * Simulation (no credentials) exists only for local development when
 * WHATSAPP_SIMULATION_MODE=true, is never available in production, and is
 * stored as `is_simulation` with recipient status 'simulated' — it never
 * produces "sent"/"delivered" metrics.
 */
import { randomUUID } from 'node:crypto';

import type {
  WhatsAppCampaignDetail,
  WhatsAppCampaignSummary,
  WhatsAppConfig,
  WhatsAppConfigTestResult,
  WhatsAppDispatchCompleteEvent,
  WhatsAppDispatchProgressEvent,
  WhatsAppMessageMode,
  WhatsAppTemplate,
  WhatsAppTemplateSyncResult,
} from '@saas/shared';
import { boundedRate } from '@saas/shared';

import { env } from '../../config/env.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { AppError, createError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';
import { readSpreadsheet } from '../../lib/spreadsheet.js';

import {
  analyzeTemplateComponents,
  buildTemplateMessagePayload,
  buildTextMessagePayload,
  extractTemplateVariables,
  graphRequest,
  sendWhatsAppMessage,
  type MetaCredentials,
  type MetaTemplateComponent,
} from './whatsapp-meta.js';
import {
  buildWhatsAppRecipients,
  renderTextBody,
  type BuiltWhatsAppRecipient,
  type WhatsAppRecipientList,
} from './whatsapp-recipients.js';
import { computeStatusUpdate, type MetaStatusEvent } from './whatsapp-webhook.logic.js';

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 300;
const INSERT_CHUNK = 500;

const graphOptions = () => ({ apiVersion: env.WHATSAPP_GRAPH_API_VERSION });

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function maskToken(token: string): string {
  return token.length > 4 ? `••••••••••••${token.slice(-4)}` : '••••••••';
}

// ── Credentials ─────────────────────────────────────────────────────────────

export interface WhatsAppConfigInput {
  phoneNumberId: string;
  wabaId?: string | undefined;
  accessToken: string;
}

interface ConfigRow {
  id: string;
  user_id: string;
  phone_number_id: string;
  waba_id: string | null;
  access_token: string;
  verified_at?: string | null;
  verified_phone_number?: string | null;
  verified_name?: string | null;
  last_verification_error?: string | null;
  created_at: string;
  updated_at: string;
}

interface TemplateRow {
  id: string;
  user_id: string;
  name: string;
  language: string | null;
  category: string | null;
  body_text: string;
  variables: string[] | null;
  status: string | null;
  meta_template_id: string | null;
  parameter_format?: string | null;
  components?: MetaTemplateComponent[] | null;
  synced_at?: string | null;
  created_at: string;
}

interface CampaignRow {
  id: string;
  title: string;
  template_id: string | null;
  status: WhatsAppCampaignSummary['status'];
  is_simulation?: boolean;
  message_mode?: string | null;
  total_recipients: number | null;
  sent_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  failed_count: number | null;
  error_message?: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface RecipientRow {
  id: string;
  campaign_id: string;
  phone: string;
  name: string | null;
  status: WhatsAppCampaignDetail['recipients'][number]['status'];
  wamid: string | null;
  error: string | null;
  error_code?: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

function rowToConfig(data: ConfigRow): WhatsAppConfig {
  return {
    id: data['id'],
    userId: data['user_id'],
    phoneNumberId: data['phone_number_id'],
    wabaId: data['waba_id'] || '',
    accessToken: maskToken(data['access_token'] || ''),
    isConfigured: !!(data['phone_number_id'] && data['access_token']),
    verifiedAt: data['verified_at'] ?? null,
    verifiedPhoneNumber: data['verified_phone_number'] ?? null,
    verifiedName: data['verified_name'] ?? null,
    lastVerificationError: data['last_verification_error'] ?? null,
    createdAt: data['created_at'],
    updatedAt: data['updated_at'],
  };
}

async function loadConfigRow(userId: string): Promise<ConfigRow | null> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_configs')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.error({ dbError: error.message, userId }, 'Failed to fetch WhatsApp config');
    throw createError.internal('Failed to load WhatsApp configuration. Please retry.');
  }
  return data?.[0] ?? null;
}

/** Fetch user's WhatsApp configuration (accessToken masked for security) */
export async function getWhatsAppConfig(userId: string): Promise<WhatsAppConfig | null> {
  const row = await loadConfigRow(userId);
  return row ? rowToConfig(row) : null;
}

function systemCredentials(): MetaCredentials | null {
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) return null;
  return {
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    wabaId: env.WHATSAPP_WABA_ID || undefined,
  };
}

export function isSimulationAllowed(): boolean {
  return env.WHATSAPP_SIMULATION_MODE && env.NODE_ENV !== 'production';
}

export type ResolvedWhatsAppSender =
  | { mode: 'live'; source: 'user' | 'system'; credentials: MetaCredentials }
  | { mode: 'simulation' };

/**
 * User config → system env config → (dev only) simulation → error.
 * A failed DB lookup throws; it never silently switches credentials.
 */
export async function resolveWhatsAppSender(userId: string): Promise<ResolvedWhatsAppSender> {
  const row = await loadConfigRow(userId);
  if (row?.['phone_number_id'] && row['access_token']) {
    return {
      mode: 'live',
      source: 'user',
      credentials: { phoneNumberId: row['phone_number_id'], accessToken: row['access_token'], wabaId: row['waba_id'] || undefined },
    };
  }
  const system = systemCredentials();
  if (system) return { mode: 'live', source: 'system', credentials: system };
  if (isSimulationAllowed()) return { mode: 'simulation' };

  throw createError.badRequest(
    'WhatsApp is not configured. Add your Phone Number ID and access token in Settings → WhatsApp Config.'
  );
}

export type EffectiveSenderMode = 'user' | 'system' | 'simulation' | 'none';

/** Which credentials a send would use right now (for UI warnings). DB errors still throw. */
export async function getEffectiveSenderMode(userId: string): Promise<EffectiveSenderMode> {
  try {
    const sender = await resolveWhatsAppSender(userId);
    return sender.mode === 'simulation' ? 'simulation' : sender.source;
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400) return 'none';
    throw err;
  }
}

/** Save or update user's WhatsApp Meta config. Changing credentials clears the verified state. */
export async function saveWhatsAppConfig(userId: string, input: WhatsAppConfigInput): Promise<WhatsAppConfig> {
  const existing = await loadConfigRow(userId);

  let finalToken = input.accessToken.trim();
  if (finalToken.startsWith('••••')) {
    if (!existing?.['access_token']) throw createError.badRequest('Access Token is required');
    finalToken = existing['access_token'];
  }

  const phoneNumberId = input.phoneNumberId.trim();
  const wabaId = (input.wabaId || '').trim();
  if (!/^\d+$/.test(phoneNumberId)) {
    throw createError.badRequest('Phone Number ID must be the numeric ID from WhatsApp Manager → API Setup (not the phone number itself).');
  }
  if (wabaId && !/^\d+$/.test(wabaId)) {
    throw createError.badRequest('WhatsApp Business Account ID must be numeric.');
  }

  const changed =
    !existing ||
    existing['phone_number_id'] !== phoneNumberId ||
    (existing['waba_id'] || '') !== wabaId ||
    existing['access_token'] !== finalToken;

  const payload: Record<string, unknown> = {
    user_id: userId,
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    access_token: finalToken,
    updated_at: new Date().toISOString(),
  };
  if (changed) {
    payload['verified_at'] = null;
    payload['verified_phone_number'] = null;
    payload['verified_name'] = null;
    payload['last_verification_error'] = null;
  }

  const query = existing
    ? supabaseAdmin.from('whatsapp_configs').update(payload).eq('id', existing['id'])
    : supabaseAdmin.from('whatsapp_configs').insert(payload);
  const { data, error } = await query.select('*').single();

  if (error || !data) {
    logger.error({ dbError: error?.message, userId }, 'Failed to save WhatsApp config');
    throw createError.internal('Failed to save WhatsApp config. If this persists, apply the latest database migration.');
  }

  logger.info({ userId, phoneNumberId, verificationReset: changed }, 'WhatsApp config saved');
  return rowToConfig(data);
}

/** Delete user's custom WhatsApp Meta config */
export async function deleteWhatsAppConfig(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('whatsapp_configs').delete().eq('user_id', userId);

  if (error) {
    logger.error({ dbError: error.message, userId }, 'Failed to delete WhatsApp config');
    throw createError.internal('Failed to delete WhatsApp config');
  }
}

/**
 * Health check against Meta using the SAVED credentials (or system env).
 * Calls GET /{phone-number-id} — read-only, sends no message. The token is
 * only sent in the Authorization header and never returned.
 */
export async function testWhatsAppConfig(userId: string): Promise<WhatsAppConfigTestResult> {
  const row = await loadConfigRow(userId);
  const credentials: MetaCredentials | null = row?.['access_token']
    ? { phoneNumberId: row['phone_number_id'], accessToken: row['access_token'], wabaId: row['waba_id'] || undefined }
    : systemCredentials();

  if (!credentials) {
    throw createError.badRequest('Save your WhatsApp credentials first, then test the connection.');
  }

  const phone = await graphRequest<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
    `${credentials.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    credentials.accessToken,
    graphOptions()
  );

  let result: WhatsAppConfigTestResult;
  if (!phone.ok) {
    result = { success: false, message: phone.error.message };
  } else if (credentials.wabaId) {
    const waba = await graphRequest<{ id: string }>(`${credentials.wabaId}?fields=id,name`, credentials.accessToken, graphOptions());
    result = waba.ok
      ? { success: true, message: 'Meta API connection verified.' }
      : { success: false, message: `Phone number OK, but the WhatsApp Business Account ID failed: ${waba.error.message}` };
  } else {
    result = {
      success: true,
      message: 'Meta API connection verified. Add your WhatsApp Business Account ID to sync templates.',
    };
  }
  if (phone.ok) {
    result = {
      ...result,
      ...(phone.data.display_phone_number && { displayPhoneNumber: phone.data.display_phone_number }),
      ...(phone.data.verified_name && { verifiedName: phone.data.verified_name }),
      ...(phone.data.quality_rating && { qualityRating: phone.data.quality_rating }),
    };
  }

  // Persist the outcome only for the user's own saved row
  if (row) {
    const { error } = await supabaseAdmin
      .from('whatsapp_configs')
      .update(
        result.success
          ? {
              verified_at: new Date().toISOString(),
              verified_phone_number: result.displayPhoneNumber ?? null,
              verified_name: result.verifiedName ?? null,
              last_verification_error: null,
            }
          : { verified_at: null, last_verification_error: result.message }
      )
      .eq('id', row['id'])
      .eq('access_token', credentials.accessToken); // don't mark a concurrently-replaced token
    if (error) {
      logger.error({ dbError: error.message, userId }, 'Failed to store WhatsApp verification result');
      return { ...result, message: `${result.message} (The result could not be saved: apply the latest database migration.)` };
    }
  }

  logger.info({ userId, success: result.success, source: row ? 'user' : 'system' }, 'WhatsApp config test completed');
  return result;
}

// ── Templates ───────────────────────────────────────────────────────────────

function rowToTemplate(t: TemplateRow): WhatsAppTemplate {
  const components = t.components ?? null;
  const analysis = components ? analyzeTemplateComponents(components, t.parameter_format ?? undefined) : null;
  return {
    id: t['id'],
    userId: t['user_id'],
    name: t['name'],
    language: t['language'] || 'en_US',
    category: t['category'] || 'MARKETING',
    bodyText: t['body_text'],
    variables: t['variables'] || [],
    // Rows never synced from Meta are local drafts, whatever older code stored
    status: t['meta_template_id'] ? t['status'] || 'PENDING' : 'LOCAL_DRAFT',
    metaTemplateId: t['meta_template_id'] ?? undefined,
    parameterFormat: analysis?.parameterFormat ?? (t.parameter_format === 'NAMED' ? 'NAMED' : t.parameter_format ? 'POSITIONAL' : undefined),
    unsupportedReason: analysis?.unsupportedReason,
    syncedAt: t['synced_at'] ?? undefined,
    createdAt: t['created_at'],
  };
}

export async function getWhatsAppTemplates(userId: string): Promise<WhatsAppTemplate[]> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ dbError: error.message, userId }, 'Failed to fetch WhatsApp templates');
    throw createError.internal('Failed to fetch WhatsApp templates');
  }
  return (data || []).map(rowToTemplate);
}

/** Local draft only — it is NOT submitted to or approved by Meta. */
export async function createWhatsAppTemplate(
  userId: string,
  template: { name: string; category?: string; language?: string; bodyText: string }
): Promise<WhatsAppTemplate> {
  const { variables } = extractTemplateVariables(template.bodyText);
  const { data, error } = await supabaseAdmin
    .from('whatsapp_templates')
    .insert({
      user_id: userId,
      name: template.name,
      category: template.category || 'MARKETING',
      language: template.language || 'en_US',
      body_text: template.bodyText,
      variables,
      status: 'LOCAL_DRAFT',
    })
    .select('*')
    .single();

  if (error || !data) {
    logger.error({ dbError: error?.message, userId }, 'Failed to create WhatsApp template');
    throw createError.internal('Failed to create WhatsApp template');
  }
  return rowToTemplate(data);
}

interface MetaTemplateRecord {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  parameter_format?: string;
  components?: MetaTemplateComponent[];
}

/** Pull the real template list (with approval status) from Meta and upsert it. */
export async function syncWhatsAppTemplates(userId: string): Promise<WhatsAppTemplateSyncResult> {
  const sender = await resolveWhatsAppSender(userId);
  if (sender.mode !== 'live') {
    throw createError.badRequest('Template sync needs real WhatsApp credentials (simulation mode has no templates).');
  }
  const { credentials } = sender;
  if (!credentials.wabaId) {
    throw createError.badRequest('Add your WhatsApp Business Account ID (WABA ID) in Settings → WhatsApp Config to sync templates.');
  }

  const records: MetaTemplateRecord[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const query = `fields=id,name,language,status,category,parameter_format,components&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`;
    const res = await graphRequest<{ data: MetaTemplateRecord[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${credentials.wabaId}/message_templates?${query}`,
      credentials.accessToken,
      graphOptions()
    );
    if (!res.ok) throw createError.badRequest(`Template sync failed: ${res.error.message}`);
    records.push(...(res.data.data || []));
    after = res.data.paging?.next ? res.data.paging.cursors?.after : undefined;
    if (!after) break;
  }

  const now = new Date().toISOString();
  const rows = records.map((t) => {
    const analysis = analyzeTemplateComponents(t.components ?? [], t.parameter_format);
    return {
      user_id: userId,
      meta_template_id: t.id,
      name: t.name,
      language: t.language,
      category: t.category ?? 'MARKETING',
      status: t.status,
      body_text: analysis.bodyText,
      variables: analysis.variables,
      parameter_format: analysis.parameterFormat,
      components: t.components ?? [],
      synced_at: now,
    };
  });

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('whatsapp_templates').upsert(rows, { onConflict: 'user_id,meta_template_id' });
    if (error) {
      logger.error({ dbError: error.message, userId }, 'Failed to store synced templates');
      throw createError.internal('Templates were fetched from Meta but could not be saved. Apply the latest database migration and retry.');
    }
  }

  // Templates deleted in Meta must not keep showing as sendable
  const ids = records.map((r) => r.id);
  let staleQuery = supabaseAdmin
    .from('whatsapp_templates')
    .update({ status: 'DELETED', synced_at: now })
    .eq('user_id', userId)
    .not('meta_template_id', 'is', null);
  if (ids.length > 0) staleQuery = staleQuery.not('meta_template_id', 'in', `(${ids.join(',')})`);
  const { error: staleError } = await staleQuery;
  if (staleError) logger.warn({ dbError: staleError.message, userId }, 'Failed to mark deleted templates');

  const templates = await getWhatsAppTemplates(userId);
  logger.info({ userId, synced: rows.length }, 'WhatsApp templates synced from Meta');
  return {
    synced: rows.length,
    approved: rows.filter((r) => r.status === 'APPROVED').length,
    templates,
  };
}

async function getSendableTemplate(userId: string, templateId: string): Promise<WhatsAppTemplate> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_templates')
    .select('*')
    .eq('id', templateId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw createError.internal('Failed to load the selected template');
  if (!data) throw createError.notFound('WhatsApp template');

  const template = rowToTemplate(data);
  if (!template.metaTemplateId) {
    throw createError.badRequest(
      `"${template.name}" is a local draft and has not been approved by Meta. Create it in WhatsApp Manager, then use "Sync from Meta".`
    );
  }
  if (template.status !== 'APPROVED') {
    throw createError.badRequest(`Template "${template.name}" is ${template.status} in Meta — only APPROVED templates can be sent.`);
  }
  if (template.unsupportedReason) {
    throw createError.badRequest(`Template "${template.name}" can't be sent from this app: ${template.unsupportedReason}`);
  }
  return template;
}

// ── Recipients / preview ────────────────────────────────────────────────────

export interface WhatsAppListInput {
  file: { buffer: Buffer; originalname: string };
  templateId?: string | undefined;
  phoneColumn?: string | undefined;
  nameColumn?: string | undefined;
  defaultCountryCode?: string | undefined;
  variableColumns?: Record<string, string> | undefined;
}

export async function buildRecipientList(
  userId: string,
  input: WhatsAppListInput
): Promise<{ list: WhatsAppRecipientList; template: WhatsAppTemplate | null }> {
  const sheet = readSpreadsheet(input.file.buffer, input.file.originalname);
  const template = input.templateId ? await getSendableTemplate(userId, input.templateId) : null;
  const list = buildWhatsAppRecipients(sheet, {
    phoneColumn: input.phoneColumn,
    nameColumn: input.nameColumn,
    defaultCountryCode: input.defaultCountryCode,
    variables: template?.variables,
    variableColumns: input.variableColumns,
  });
  return { list, template };
}

// ── Campaigns ───────────────────────────────────────────────────────────────

function rowToSummary(c: CampaignRow): WhatsAppCampaignSummary {
  const delivered = c['delivered_count'] || 0;
  const read = c['read_count'] || 0;
  return {
    id: c['id'],
    title: c['title'],
    templateId: c['template_id'] ?? undefined,
    status: c['status'],
    isSimulation: c['is_simulation'] === true,
    totalRecipients: c['total_recipients'] || 0,
    sentCount: c['sent_count'] || 0,
    deliveredCount: delivered,
    readCount: read,
    failedCount: c['failed_count'] || 0,
    readRate: boundedRate(read, delivered),
    errorMessage: c['error_message'] ?? null,
    createdAt: c['created_at'],
    startedAt: c['started_at'] ?? undefined,
    completedAt: c['completed_at'] ?? undefined,
  };
}

export async function getWhatsAppCampaigns(userId: string): Promise<WhatsAppCampaignSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_campaigns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ dbError: error.message, userId }, 'Failed to fetch WhatsApp campaigns');
    throw createError.internal('Failed to fetch WhatsApp campaigns');
  }
  return (data || []).map(rowToSummary);
}

export async function getWhatsAppCampaignById(id: string, userId: string): Promise<WhatsAppCampaignDetail> {
  const { data: campaign, error } = await supabaseAdmin
    .from('whatsapp_campaigns')
    .select('*, whatsapp_recipients (*)')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error({ dbError: error.message, id }, 'Failed to fetch WhatsApp campaign');
    throw createError.internal('Failed to fetch WhatsApp campaign');
  }
  if (!campaign) throw createError.notFound('WhatsApp campaign');

  return {
    ...rowToSummary(campaign),
    ...(campaign.message_mode && { messageMode: campaign.message_mode as WhatsAppMessageMode }),
    recipients: ((campaign.whatsapp_recipients || []) as RecipientRow[]).map((r) => ({
      id: r.id,
      campaignId: r.campaign_id,
      phone: r.phone,
      name: r.name ?? undefined,
      status: r.status,
      wamid: r.wamid ?? undefined,
      error: r.error ?? undefined,
      errorCode: r.error_code ?? undefined,
      sentAt: r.sent_at ?? undefined,
      deliveredAt: r.delivered_at ?? undefined,
      readAt: r.read_at ?? undefined,
    })),
  };
}

export interface PreparedDispatch {
  userId: string;
  title: string;
  mode: WhatsAppMessageMode;
  bodyText: string | null;
  template: WhatsAppTemplate | null;
  sender: ResolvedWhatsAppSender;
  list: WhatsAppRecipientList;
}

/** Validate everything BEFORE opening the SSE stream so errors return as normal JSON. */
export async function prepareWhatsAppDispatch(
  userId: string,
  input: WhatsAppListInput & { title: string; mode: WhatsAppMessageMode; bodyText?: string | undefined }
): Promise<PreparedDispatch> {
  if (input.mode === 'template' && !input.templateId) {
    throw createError.badRequest('Select an approved Meta template, or switch to a free-form text message.');
  }
  if (input.mode === 'text' && !input.bodyText?.trim()) {
    throw createError.badRequest('Message text is required for free-form messages.');
  }

  const sender = await resolveWhatsAppSender(userId);
  const { list, template } = await buildRecipientList(userId, {
    ...input,
    templateId: input.mode === 'template' ? input.templateId : undefined,
  });

  if (!list.phoneColumn) {
    throw createError.badRequest('Could not find a phone number column. Add a header such as "phone" to the first row.');
  }
  if (list.sendable.length === 0) {
    throw createError.badRequest(
      `No valid recipients (${list.totalInvalid} invalid, ${list.duplicateCount} duplicate). Fix the file and preview it again.`
    );
  }

  return {
    userId,
    title: input.title,
    mode: input.mode,
    bodyText: input.mode === 'text' ? input.bodyText!.trim() : null,
    template,
    sender,
    list,
  };
}

export interface StoredRecipient extends BuiltWhatsAppRecipient {
  id: string;
}

export async function createWhatsAppCampaign(
  prepared: PreparedDispatch
): Promise<{ campaignId: string; recipients: StoredRecipient[] }> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_campaigns')
    .insert({
      user_id: prepared.userId,
      title: prepared.title,
      template_id: prepared.template?.id ?? null,
      template_name: prepared.template?.name ?? null,
      template_language: prepared.template?.language ?? null,
      message_mode: prepared.mode,
      body_text: prepared.bodyText,
      is_simulation: prepared.sender.mode === 'simulation',
      status: 'pending',
      total_recipients: prepared.list.sendable.length,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.error({ dbError: error?.message, userId: prepared.userId }, 'Failed to create WhatsApp campaign record');
    throw createError.internal('Failed to create WhatsApp campaign. If this persists, apply the latest database migration.');
  }

  const campaignId = data.id as string;
  const recipients: StoredRecipient[] = prepared.list.sendable.map((r) => ({ ...r, id: randomUUID() }));

  for (let i = 0; i < recipients.length; i += INSERT_CHUNK) {
    const chunk = recipients.slice(i, i + INSERT_CHUNK).map((r) => ({
      id: r.id,
      campaign_id: campaignId,
      phone: r.phone,
      name: r.name || null,
      status: 'pending',
      variables: prepared.mode === 'template' ? r.variableValues : r.mergeData,
    }));
    const { error: insertError } = await supabaseAdmin.from('whatsapp_recipients').insert(chunk);
    if (insertError) {
      logger.error({ dbError: insertError.message, campaignId }, 'Failed to store WhatsApp recipients');
      await supabaseAdmin.from('whatsapp_campaigns').delete().eq('id', campaignId);
      throw createError.internal('Failed to store WhatsApp recipients. Nothing was sent.');
    }
  }

  return { campaignId, recipients };
}

/** Recount campaign counters from recipient rows — idempotent by construction. */
export async function refreshWhatsAppCampaignCounts(campaignId: string): Promise<{
  sent: number;
  delivered: number;
  read: number;
  failed: number;
} | null> {
  const base = () =>
    supabaseAdmin.from('whatsapp_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId);

  try {
    const results = await Promise.all([
      base().not('wamid', 'is', null), // accepted by Meta (includes later failures)
      base().in('status', ['delivered', 'read']),
      base().eq('status', 'read'),
      base().eq('status', 'failed'),
    ]);
    const [sent, delivered, read, failed] = results.map((r) => {
      if (r.error) throw new Error(r.error.message);
      return r.count ?? 0;
    }) as [number, number, number, number];
    const { error } = await supabaseAdmin
      .from('whatsapp_campaigns')
      .update({ sent_count: sent, delivered_count: delivered, read_count: read, failed_count: failed })
      .eq('id', campaignId);
    if (error) throw new Error(error.message);
    return { sent, delivered, read, failed };
  } catch (err) {
    logger.error({ err, campaignId }, 'Failed to refresh WhatsApp campaign counters');
    return null;
  }
}

export interface DispatchEmitter {
  progress(data: WhatsAppDispatchProgressEvent): void;
}

/**
 * Send to every stored recipient. Runs to completion even if the client
 * disconnects (results are persisted; the campaign page shows them).
 */
export async function dispatchWhatsAppCampaign(
  prepared: PreparedDispatch,
  campaignId: string,
  recipients: StoredRecipient[],
  emitter: DispatchEmitter
): Promise<WhatsAppDispatchCompleteEvent> {
  const total = recipients.length;
  const isSimulation = prepared.sender.mode === 'simulation';
  const log = logger.child({ campaignId, userId: prepared.userId });
  let sent = 0;
  let failed = 0;
  let simulated = 0;
  let persistenceErrors = 0;

  const { error: startError } = await supabaseAdmin
    .from('whatsapp_campaigns')
    .update({ status: 'sending', started_at: new Date().toISOString() })
    .eq('id', campaignId);
  if (startError) persistenceErrors++;

  log.info({ total, mode: prepared.mode, sender: prepared.sender.mode === 'live' ? prepared.sender.source : 'simulation' }, 'WhatsApp dispatch started');

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (recipient) => {
        let update: Record<string, unknown>;
        let status: WhatsAppDispatchProgressEvent['status'];
        let reason: string | undefined;

        if (prepared.sender.mode === 'simulation') {
          simulated++;
          status = 'simulated';
          update = { status: 'simulated', error: 'Simulation only — no message was sent' };
        } else {
          const payload =
            prepared.mode === 'template' && prepared.template
              ? buildTemplateMessagePayload(
                  recipient.phone,
                  {
                    name: prepared.template.name,
                    language: prepared.template.language,
                    variables: prepared.template.variables,
                    parameterFormat: prepared.template.parameterFormat ?? 'POSITIONAL',
                  },
                  recipient.variableValues
                )
              : buildTextMessagePayload(recipient.phone, renderTextBody(prepared.bodyText ?? '', recipient.mergeData));

          const result = await sendWhatsAppMessage(prepared.sender.credentials, payload, graphOptions());
          if (result.ok) {
            sent++;
            status = 'sent';
            update = { status: 'sent', wamid: result.wamid, sent_at: new Date().toISOString(), error: null, error_code: null };
          } else {
            failed++;
            status = 'failed';
            reason = result.error.message;
            update = { status: 'failed', error: result.error.message, error_code: result.error.code };
            log.warn({ recipientId: recipient.id, code: result.error.code }, 'WhatsApp message rejected');
          }
        }

        const { error } = await supabaseAdmin.from('whatsapp_recipients').update(update).eq('id', recipient.id);
        if (error) {
          persistenceErrors++;
          log.error({ recipientId: recipient.id, dbError: error.message }, 'Failed to record WhatsApp recipient status');
        }

        emitter.progress({
          recipientId: recipient.id,
          phone: recipient.phone,
          status,
          ...(reason && { reason }),
          sent,
          failed,
          simulated,
          total,
        });
      })
    );

    if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
  }

  const counts = await refreshWhatsAppCampaignCounts(campaignId);
  if (!counts) persistenceErrors++;

  const outcome: WhatsAppDispatchCompleteEvent['outcome'] = isSimulation
    ? 'simulated'
    : sent === 0
      ? 'failed'
      : failed > 0
        ? 'partial'
        : 'success';

  const errorMessage = isSimulation
    ? 'Simulation only — no WhatsApp messages were sent.'
    : persistenceErrors > 0
      ? `${persistenceErrors} status update(s) could not be saved; counts may be incomplete.`
      : outcome === 'failed'
        ? 'All messages were rejected by Meta — see recipient errors.'
        : null;

  const { error: finalError } = await supabaseAdmin
    .from('whatsapp_campaigns')
    .update({
      status: outcome === 'failed' ? 'failed' : 'completed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', campaignId);
  if (finalError) {
    persistenceErrors++;
    log.error({ dbError: finalError.message }, 'Failed to store final WhatsApp campaign status');
  }

  log.info({ total, sent, failed, simulated, persistenceErrors, outcome }, 'WhatsApp dispatch complete');
  return { campaignId, total, sent, failed, simulated, isSimulation, persistenceErrors, outcome };
}

export async function markCampaignFailed(campaignId: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from('whatsapp_campaigns')
    .update({ status: 'failed', error_message: reason, completed_at: new Date().toISOString() })
    .eq('id', campaignId);
}

// ── Webhook status processing ───────────────────────────────────────────────

/**
 * Apply one Meta status callback. Uses an optimistic-concurrency update
 * (WHERE status = <what we read>) so concurrent callbacks for the same
 * message can't overwrite each other; counters are then recomputed.
 * Returns whether anything changed.
 */
export async function processStatusEvent(event: MetaStatusEvent): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: rows, error } = await supabaseAdmin
      .from('whatsapp_recipients')
      .select('id, campaign_id, status, delivered_at, read_at, error')
      .eq('wamid', event.id)
      .limit(1);

    if (error) throw new Error(`Recipient lookup failed: ${error.message}`);
    const row = rows?.[0];
    if (!row) {
      // The callback can race the dispatcher storing the wamid — wait briefly once
      if (attempt === 0) {
        await sleep(2_000);
        continue;
      }
      logger.info({ wamid: event.id, status: event.status }, 'WhatsApp status for unknown message id — ignored');
      return false;
    }

    const update = computeStatusUpdate(row, event);
    if (!update) return false; // duplicate / stale / regression

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('whatsapp_recipients')
      .update(update)
      .eq('id', row.id)
      .eq('status', row.status)
      .select('id');
    if (updateError) throw new Error(`Recipient update failed: ${updateError.message}`);

    if ((updated?.length ?? 0) > 0) {
      await refreshWhatsAppCampaignCounts(row.campaign_id);
      return true;
    }
    // Lost a race with another callback — re-read and re-evaluate
  }
  return false;
}
