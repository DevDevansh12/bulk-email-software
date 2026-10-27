import {
  createSseParser,
  type ApiErrorResponse,
  type WhatsAppCampaignSummary,
  type WhatsAppCampaignDetail,
  type WhatsAppConfig,
  type WhatsAppConfigTestResult,
  type WhatsAppDispatchCompleteEvent,
  type WhatsAppDispatchProgressEvent,
  type WhatsAppDispatchStartEvent,
  type WhatsAppMessageMode,
  type WhatsAppParsePreviewResponse,
  type WhatsAppTemplate,
  type WhatsAppTemplateSyncResult,
} from '@saas/shared';

import { apiClient } from './api-client';

/**
 * Get authorization headers from the centralized apiClient.
 * This ensures we always use the current valid token managed by auth.store.
 */
function getAuthHeader(): Record<string, string> {
  const token = apiClient.defaults.headers.common['Authorization'] as string | undefined;
  return token ? { Authorization: token } : {};
}

export async function fetchWhatsAppCampaigns(): Promise<WhatsAppCampaignSummary[]> {
  const res = await apiClient.get('/whatsapp/campaigns', { headers: getAuthHeader() });
  return res.data.data;
}

export async function fetchWhatsAppCampaign(id: string): Promise<WhatsAppCampaignDetail> {
  const res = await apiClient.get(`/whatsapp/campaigns/${id}`, { headers: getAuthHeader() });
  return res.data.data;
}

export async function fetchWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  const res = await apiClient.get('/whatsapp/templates', { headers: getAuthHeader() });
  return res.data.data;
}

/** Saves a LOCAL DRAFT only — it is not submitted to Meta. */
export async function createWhatsAppTemplate(template: { name: string; category: string; language?: string; bodyText: string }): Promise<WhatsAppTemplate> {
  const res = await apiClient.post('/whatsapp/templates', template, { headers: getAuthHeader() });
  return res.data.data;
}

export async function syncWhatsAppTemplates(): Promise<WhatsAppTemplateSyncResult> {
  const res = await apiClient.post('/whatsapp/templates/sync', {}, { headers: getAuthHeader(), timeout: 60_000 });
  return res.data.data;
}

export interface WhatsAppListOptions {
  templateId?: string | undefined;
  phoneColumn?: string | undefined;
  nameColumn?: string | undefined;
  defaultCountryCode?: string | undefined;
  variableColumns?: Record<string, string> | undefined;
}

function appendListOptions(formData: FormData, options: WhatsAppListOptions) {
  if (options.templateId) formData.append('templateId', options.templateId);
  if (options.phoneColumn) formData.append('phoneColumn', options.phoneColumn);
  if (options.nameColumn) formData.append('nameColumn', options.nameColumn);
  if (options.defaultCountryCode) formData.append('defaultCountryCode', options.defaultCountryCode);
  if (options.variableColumns) formData.append('variableColumns', JSON.stringify(options.variableColumns));
}

/** Server-side preview — uses the exact validation the send endpoint applies. */
export async function parseWhatsAppCsv(file: File, options: WhatsAppListOptions = {}): Promise<WhatsAppParsePreviewResponse> {
  const formData = new FormData();
  formData.append('file', file);
  appendListOptions(formData, options);

  const res = await apiClient.post('/whatsapp/parse-preview', formData, {
    headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' },
    timeout: 60_000,
  });
  return res.data.data;
}

/** Which credentials a send would use: the user's, the server default, a dev simulation, or none. */
export type WhatsAppEffectiveSender = 'user' | 'system' | 'simulation' | 'none';

export async function fetchWhatsAppConfig(): Promise<{
  config: WhatsAppConfig | null;
  simulationAvailable: boolean;
  effectiveSender: WhatsAppEffectiveSender;
}> {
  const res = await apiClient.get('/whatsapp/config', { headers: getAuthHeader() });
  return {
    config: res.data.data,
    simulationAvailable: Boolean(res.data.meta?.simulationAvailable),
    effectiveSender: res.data.meta?.effectiveSender ?? 'none',
  };
}

export async function saveWhatsAppConfig(data: { phoneNumberId: string; wabaId?: string | undefined; accessToken: string }): Promise<WhatsAppConfig> {
  const res = await apiClient.post('/whatsapp/config', data, { headers: getAuthHeader() });
  return res.data.data;
}

export async function testWhatsAppConfig(): Promise<WhatsAppConfigTestResult> {
  const res = await apiClient.post('/whatsapp/config/test', {}, { headers: getAuthHeader(), timeout: 30_000 });
  return res.data.data;
}

export async function deleteWhatsAppConfig(): Promise<void> {
  await apiClient.delete('/whatsapp/config', { headers: getAuthHeader() });
}

// ── Dispatch (SSE) ───────────────────────────────────────────────────────────

export interface WhatsAppDispatchRequest extends WhatsAppListOptions {
  file: File;
  title: string;
  messageMode: WhatsAppMessageMode;
  bodyText?: string | undefined;
}

export interface WhatsAppDispatchHandlers {
  onStart: (data: WhatsAppDispatchStartEvent) => void;
  onProgress: (data: WhatsAppDispatchProgressEvent) => void;
}

/**
 * How the stream ended:
 *   completed   — server sent `complete` (see result.outcome for success/partial/failed/simulated)
 *   error       — server sent `error` after the campaign started
 *   interrupted — the connection closed without a terminal event; the campaign
 *                 may still be running server-side
 */
export type WhatsAppDispatchResult =
  | { kind: 'completed'; result: WhatsAppDispatchCompleteEvent }
  | { kind: 'error'; message: string; campaignId?: string | undefined }
  | { kind: 'interrupted'; message: string; campaignId?: string | undefined };

export async function sendWhatsAppCampaign(
  request: WhatsAppDispatchRequest,
  handlers: WhatsAppDispatchHandlers,
  signal?: AbortSignal
): Promise<WhatsAppDispatchResult> {
  const formData = new FormData();
  formData.append('file', request.file);
  formData.append('title', request.title);
  formData.append('messageMode', request.messageMode);
  if (request.bodyText) formData.append('bodyText', request.bodyText);
  appendListOptions(formData, request);

  const baseUrl = import.meta.env['VITE_API_URL'] ?? '';
  const response = await fetch(`${baseUrl}/api/v1/whatsapp/send`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: formData,
    ...(signal && { signal }),
  });

  // Validation errors arrive as normal JSON before any stream is opened
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as ApiErrorResponse;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error('The server did not return a progress stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  let campaignId: string | undefined;
  let terminal: WhatsAppDispatchResult | null = null;

  const handle = (event: string, data: string) => {
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return; // ignore malformed event
    }
    if (event === 'start') {
      const start = payload as WhatsAppDispatchStartEvent;
      campaignId = start.campaignId;
      handlers.onStart(start);
    } else if (event === 'progress') {
      handlers.onProgress(payload as WhatsAppDispatchProgressEvent);
    } else if (event === 'complete') {
      terminal = { kind: 'completed', result: payload as WhatsAppDispatchCompleteEvent };
    } else if (event === 'error') {
      const err = payload as { message?: string; campaignId?: string };
      terminal = { kind: 'error', message: err.message ?? 'Dispatch failed', campaignId: err.campaignId ?? campaignId };
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const evt of parser.push(decoder.decode(value, { stream: true }))) handle(evt.event, evt.data);
    }
    for (const evt of parser.push(decoder.decode())) handle(evt.event, evt.data);
  } catch (err) {
    if (!terminal) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      return {
        kind: 'interrupted',
        campaignId,
        message: aborted
          ? 'You stopped watching the progress stream. Messages already queued keep sending on the server.'
          : 'The connection to the progress stream was lost. The campaign may still be sending — check the campaign page.',
      };
    }
  }

  return (
    terminal ?? {
      kind: 'interrupted',
      campaignId,
      message: 'The progress stream ended before the server confirmed completion. Check the campaign page for the final status.',
    }
  );
}
