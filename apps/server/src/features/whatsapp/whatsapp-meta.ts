/**
 * Meta WhatsApp Cloud API helpers.
 *
 * Pure builders (payloads, template analysis, error explanations) plus a thin
 * fetch wrapper. `fetchImpl` is injectable so the request shape can be tested
 * without network access. The access token is only ever placed in the
 * Authorization header — never in URLs, logs, or error messages.
 */

export interface MetaCredentials {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string | undefined;
}

export interface MetaApiError {
  code?: number;
  error_subcode?: number;
  message?: string;
  type?: string;
  error_user_msg?: string;
  error_data?: { details?: string };
  fbtrace_id?: string;
}

export interface MetaErrorInfo {
  /** Safe, actionable explanation for the user */
  message: string;
  /** Meta error code as a string (e.g. "131047"), or "network" / "http_<status>" */
  code: string;
  /** Meta guarantees the message was NOT accepted, so resending cannot duplicate it */
  retryable: boolean;
}

// ── Templates ────────────────────────────────────────────────────────────────

export interface MetaTemplateComponent {
  type: string; // HEADER | BODY | FOOTER | BUTTONS | CAROUSEL | LIMITED_TIME_OFFER
  format?: string; // HEADER: TEXT | IMAGE | VIDEO | DOCUMENT | LOCATION
  text?: string;
  buttons?: { type: string; url?: string; text?: string }[];
}

export interface TemplateAnalysis {
  bodyText: string;
  /** Variable names in the order Meta expects parameters */
  variables: string[];
  parameterFormat: 'POSITIONAL' | 'NAMED';
  /** Set when the template needs inputs this app cannot supply yet */
  unsupportedReason?: string;
}

const VARIABLE_REGEX = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Unique placeholder names in a template text, in Meta's parameter order. */
export function extractTemplateVariables(text: string): { variables: string[]; format: 'POSITIONAL' | 'NAMED' } {
  const seen: string[] = [];
  for (const match of text.matchAll(VARIABLE_REGEX)) {
    const name = match[1]!;
    if (!seen.includes(name)) seen.push(name);
  }
  const positional = seen.length > 0 && seen.every((v) => /^\d+$/.test(v));
  if (positional) {
    return { variables: [...seen].sort((a, b) => Number(a) - Number(b)), format: 'POSITIONAL' };
  }
  return { variables: seen, format: seen.length === 0 ? 'POSITIONAL' : 'NAMED' };
}

/** Work out which inputs a Meta template needs; flag ones this app can't fill. */
export function analyzeTemplateComponents(
  components: MetaTemplateComponent[],
  declaredFormat?: string
): TemplateAnalysis {
  const body = components.find((c) => c.type?.toUpperCase() === 'BODY');
  const bodyText = body?.text ?? '';
  const { variables, format } = extractTemplateVariables(bodyText);
  const parameterFormat = declaredFormat?.toUpperCase() === 'NAMED' ? 'NAMED' : format;

  let unsupportedReason: string | undefined;
  for (const c of components) {
    const type = c.type?.toUpperCase();
    if (type === 'HEADER') {
      const fmt = (c.format ?? 'TEXT').toUpperCase();
      if (fmt !== 'TEXT') unsupportedReason = `Template has a ${fmt.toLowerCase()} header, which requires media input (not supported yet).`;
      else if (c.text && /\{\{\s*[A-Za-z0-9_]+\s*\}\}/.test(c.text)) {
        unsupportedReason = 'Template header contains variables (not supported yet).';
      }
    } else if (type === 'BUTTONS') {
      for (const b of c.buttons ?? []) {
        const bt = b.type?.toUpperCase();
        if (bt === 'URL' && b.url?.includes('{{')) unsupportedReason = 'Template has a dynamic URL button (not supported yet).';
        if (bt && !['URL', 'QUICK_REPLY', 'PHONE_NUMBER'].includes(bt)) {
          unsupportedReason = `Template has a ${bt.toLowerCase()} button that needs extra parameters (not supported yet).`;
        }
      }
    } else if (type === 'CAROUSEL' || type === 'LIMITED_TIME_OFFER') {
      unsupportedReason = `Template uses ${type.toLowerCase()} components (not supported yet).`;
    }
  }

  return { bodyText, variables, parameterFormat, ...(unsupportedReason && { unsupportedReason }) };
}

// ── Message payloads ─────────────────────────────────────────────────────────

export interface TemplateMessageSpec {
  name: string;
  language: string;
  variables: string[];
  parameterFormat: 'POSITIONAL' | 'NAMED';
}

/** Payload for an approved template message (required outside the 24h service window). */
export function buildTemplateMessagePayload(to: string, template: TemplateMessageSpec, values: string[]) {
  if (values.length !== template.variables.length) {
    throw new Error(`Template "${template.name}" needs ${template.variables.length} parameter(s), got ${values.length}`);
  }

  const components =
    template.variables.length === 0
      ? []
      : [
          {
            type: 'body',
            parameters: template.variables.map((name, i) => ({
              type: 'text',
              text: values[i]!,
              ...(template.parameterFormat === 'NAMED' && { parameter_name: name }),
            })),
          },
        ];

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length > 0 && { components }),
    },
  };
}

/** Free-form text — Meta only delivers it inside a 24h customer-service window. */
export function buildTextMessagePayload(to: string, body: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body },
  };
}

// ── Error explanations ───────────────────────────────────────────────────────

const RETRYABLE_CODES = new Set([4, 80007, 130429, 131056]);

export function describeMetaError(error: MetaApiError | undefined, httpStatus?: number): MetaErrorInfo {
  const code = error?.code;
  const details = error?.error_data?.details ?? error?.error_user_msg ?? error?.message ?? '';
  const suffix = details ? ` (Meta: ${details.slice(0, 200)})` : '';
  const codeStr = code !== undefined ? String(code) : httpStatus ? `http_${httpStatus}` : 'unknown';
  const make = (message: string) => ({ message: message + suffix, code: codeStr, retryable: code !== undefined && RETRYABLE_CODES.has(code) });

  switch (code) {
    case 190:
      return make('Access token is invalid or expired. Generate a permanent System User token in Meta Business Settings and save it again.');
    case 10:
    case 200:
    case 294:
      return make('The access token lacks permission. It needs whatsapp_business_messaging (and whatsapp_business_management for templates) and must be assigned to this WhatsApp Business Account.');
    case 100:
      if (error?.error_subcode === 33) {
        return make('Phone Number ID or WABA ID not found, or the token has no access to it. Check the IDs in WhatsApp Manager → API Setup.');
      }
      return make('Meta rejected a request parameter.');
    case 131030:
      return make('Recipient is not in the allowed list. With a Meta test number you can only message numbers added under App Dashboard → WhatsApp → API Setup.');
    case 131047:
      return make('More than 24 hours have passed since this person last messaged you, so free-form text cannot be delivered. Send an approved template instead.');
    case 131026:
      return make('Message undeliverable: the number may not be on WhatsApp, or the recipient has not accepted the latest terms / uses an old app version.');
    case 131049:
      return make('Meta chose not to deliver this marketing message to protect user experience (per-user marketing message limit). Retry later, not immediately.');
    case 131050:
      return make('The recipient has stopped receiving marketing messages from your business.');
    case 131048:
      return make('Spam rate limit hit: too many recipients blocked or reported recent messages. Improve message quality before sending more.');
    case 131056:
      return make('Too many messages to this number in a short time (pair rate limit).');
    case 130429:
    case 80007:
    case 4:
      return make('Meta API rate limit reached.');
    case 131042:
      return make('Business payment issue. Add or fix the payment method in WhatsApp Manager.');
    case 131031:
      return make('The WhatsApp Business Account is locked or restricted. Check Account Quality in WhatsApp Manager.');
    case 368:
      return make('The account is temporarily blocked for policy violations.');
    case 133010:
      return make('This phone number is not registered with the Cloud API. Complete phone number registration in WhatsApp Manager.');
    case 132000:
      return make('The number of template parameters does not match the template. Re-sync templates and check the variable mapping.');
    case 132001:
      return make('Template does not exist in this language or is not approved. Re-sync templates from Meta.');
    case 132005:
      return make('Template text is too long after inserting the variable values.');
    case 132007:
      return make('A variable value violates WhatsApp formatting rules (e.g. new lines, tabs, or more than 4 consecutive spaces).');
    case 132012:
      return make('A template parameter has the wrong format for this template.');
    case 132015:
    case 132016:
      return make('This template is paused or disabled by Meta because of low quality.');
    default:
      if (httpStatus && httpStatus >= 500) return make('Meta API is temporarily unavailable.');
      return make(error?.message ? 'Meta API error.' : 'Unknown Meta API error.');
  }
}

// ── HTTP client ──────────────────────────────────────────────────────────────

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface GraphClientOptions {
  apiVersion: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export type MetaResult<T> = { ok: true; data: T } | { ok: false; error: MetaErrorInfo; raw?: MetaApiError };

export async function graphRequest<T>(
  path: string,
  accessToken: string,
  options: GraphClientOptions & { method?: 'GET' | 'POST'; body?: unknown }
): Promise<MetaResult<T>> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 20_000) }));
  const url = `https://graph.facebook.com/${options.apiVersion}/${path.replace(/^\//, '')}`;

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });
  } catch (err) {
    // The request may or may not have reached Meta — never treat as safe to resend
    const reason = err instanceof Error ? err.message : 'network error';
    return { ok: false, error: { message: `Could not reach the Meta API (${reason}). Delivery status unknown — check before resending.`, code: 'network', retryable: false } };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON body
  }

  if (!response.ok) {
    const raw = (body as { error?: MetaApiError } | null)?.error;
    return { ok: false, error: describeMetaError(raw, response.status), ...(raw && { raw }) };
  }
  return { ok: true, data: body as T };
}

export interface SendMessageResponse {
  messages?: { id: string; message_status?: string }[];
}

const RETRY_DELAYS_MS = [2_000, 6_000];

/** Send one message; retries only when Meta says it was rate-limited (not accepted). */
export async function sendWhatsAppMessage(
  credentials: MetaCredentials,
  payload: object,
  options: GraphClientOptions & { sleep?: (ms: number) => Promise<void> }
): Promise<{ ok: true; wamid: string } | { ok: false; error: MetaErrorInfo }> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  for (let attempt = 0; ; attempt++) {
    const result = await graphRequest<SendMessageResponse>(`${credentials.phoneNumberId}/messages`, credentials.accessToken, {
      ...options,
      method: 'POST',
      body: payload,
    });

    if (result.ok) {
      const wamid = result.data.messages?.[0]?.id;
      if (!wamid) {
        return { ok: false, error: { message: 'Meta accepted the request but returned no message id.', code: 'no_message_id', retryable: false } };
      }
      return { ok: true, wamid };
    }

    const delay = RETRY_DELAYS_MS[attempt];
    if (!result.error.retryable || delay === undefined) return { ok: false, error: result.error };
    await sleep(delay);
  }
}
