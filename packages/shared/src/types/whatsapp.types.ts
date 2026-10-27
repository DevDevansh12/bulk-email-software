export type WhatsAppCampaignStatus = 'pending' | 'sending' | 'completed' | 'failed';

/**
 * Recipient lifecycle:
 *   pending → sent (accepted by Meta) → delivered → read
 *   any → failed (rejected by the API or reported failed by webhook)
 *   simulated — dev-only simulation, never counted as a real send
 */
export type WhatsAppRecipientStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'simulated';

/**
 * Statuses returned by Meta for message templates, plus LOCAL_DRAFT for
 * templates that exist only in this app and have NOT been approved by Meta.
 */
export type WhatsAppTemplateStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'LOCAL_DRAFT'
  | (string & {});

export type WhatsAppMessageMode = 'template' | 'text';

export interface WhatsAppConfig {
  id: string;
  userId: string;
  phoneNumberId: string;
  wabaId: string;
  /** Always masked — the real token never leaves the server */
  accessToken: string;
  isConfigured: boolean;
  /** Set only after a successful Meta API health check against these exact credentials */
  verifiedAt: string | null;
  verifiedPhoneNumber: string | null;
  verifiedName: string | null;
  lastVerificationError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppConfigTestResult {
  success: boolean;
  message: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
}

export interface WhatsAppTemplate {
  id: string;
  userId: string;
  name: string;
  language: string;
  category: string;
  bodyText: string;
  /** Placeholder names in order, e.g. ["1","2"] (positional) or ["customer_name"] (named) */
  variables: string[];
  status: WhatsAppTemplateStatus;
  /** Present only for templates synced from Meta */
  metaTemplateId?: string | undefined;
  parameterFormat?: 'POSITIONAL' | 'NAMED' | undefined;
  /** Why this template cannot be sent by this app (e.g. media header), if any */
  unsupportedReason?: string | undefined;
  syncedAt?: string | undefined;
  createdAt: string;
}

export interface WhatsAppTemplateSyncResult {
  synced: number;
  approved: number;
  templates: WhatsAppTemplate[];
}

export interface WhatsAppRecipient {
  id: string;
  campaignId: string;
  phone: string;
  name?: string | undefined;
  status: WhatsAppRecipientStatus;
  wamid?: string | undefined;
  error?: string | undefined;
  errorCode?: string | undefined;
  sentAt?: string | undefined;
  deliveredAt?: string | undefined;
  readAt?: string | undefined;
}

export interface WhatsAppCampaignSummary {
  id: string;
  title: string;
  templateId?: string | undefined;
  status: WhatsAppCampaignStatus;
  isSimulation: boolean;
  totalRecipients: number;
  /** Accepted by the Meta API (has a message id) */
  sentCount: number;
  /** Confirmed delivered by Meta webhook (includes read) */
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  /** readCount / deliveredCount × 100; null when nothing delivered yet */
  readRate?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
}

export interface WhatsAppCampaignDetail extends WhatsAppCampaignSummary {
  messageMode?: WhatsAppMessageMode | undefined;
  recipients: WhatsAppRecipient[];
}

// ── CSV preview ──────────────────────────────────────────────────────────────

export type WhatsAppPreviewStatus = 'valid' | 'invalid' | 'duplicate';

export interface WhatsAppRecipientPreview {
  rowNumber: number;
  /** Raw value from the file */
  rawPhone: string;
  /** Normalized E.164 digits (no "+") when valid */
  phone: string;
  name?: string;
  status: WhatsAppPreviewStatus;
  valid: boolean;
  error?: string;
  duplicateOfRow?: number;
  /** Values for the selected template's variables, in variable order */
  variableValues?: string[];
}

export interface WhatsAppParsePreviewResponse {
  recipients: WhatsAppRecipientPreview[];
  columns: string[];
  phoneColumn: string | null;
  nameColumn: string | null;
  totalRows: number;
  totalValid: number;
  totalInvalid: number;
  duplicateCount: number;
}

// ── SSE dispatch protocol (POST /whatsapp/send) ──────────────────────────────
// event: start     data: WhatsAppDispatchStartEvent
// event: progress  data: WhatsAppDispatchProgressEvent
// event: complete  data: WhatsAppDispatchCompleteEvent
// event: error     data: { message: string; campaignId?: string }

export interface WhatsAppDispatchStartEvent {
  campaignId: string;
  total: number;
  title: string;
  isSimulation: boolean;
  skipped: { invalid: number; duplicates: number };
}

export interface WhatsAppDispatchProgressEvent {
  recipientId: string;
  phone: string;
  status: 'sent' | 'failed' | 'simulated';
  reason?: string;
  sent: number;
  failed: number;
  simulated: number;
  total: number;
}

export interface WhatsAppDispatchCompleteEvent {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
  simulated: number;
  isSimulation: boolean;
  /** Status updates that could not be written to the database */
  persistenceErrors: number;
  outcome: 'success' | 'partial' | 'failed' | 'simulated';
}
