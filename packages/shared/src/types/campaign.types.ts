/**
 * Campaign-related types shared between client and server.
 *
 * These types define the shape of data flowing through the campaign API.
 * Server serializes to these shapes; client types against them.
 */

// ── Campaign statuses ─────────────────────────────────────────────────────────

export type CampaignStatus = 'pending' | 'scheduled' | 'sending' | 'completed' | 'failed';
export type RecipientStatus = 'pending' | 'sent' | 'failed';

// ── Recipient ─────────────────────────────────────────────────────────────────

export interface FileInfo {
  name: string;
  size: number;
  rowCount: number;
  type: 'csv' | 'excel';
}

export interface ColumnMapping {
  original: string;
  mapped: string;
  autoDetected: boolean;
}

export type RecipientPreviewStatus = 'valid' | 'invalid' | 'duplicate';

/** A parsed recipient row from CSV/Excel preview */
export interface RecipientPreview {
  email: string;
  name?: string | undefined;
  /** true only when this address will actually be sent to (valid AND first occurrence) */
  valid: boolean;
  status: RecipientPreviewStatus;
  error?: string | undefined;
  /** 1-based spreadsheet row number (header row = 1, first data row = 2) */
  rowNumber: number;
  /** For duplicates: the row number of the first occurrence that will be sent */
  duplicateOfRow?: number | undefined;
  [key: string]: any;
}

/** A duplicate address that was skipped, with where it first appeared. */
export interface DuplicateRecipient {
  email: string;
  rowNumber: number;
  firstSeenRow: number;
}

/** A recipient with delivery status (stored in DB) */
export interface CampaignRecipient {
  id: string;
  email: string;
  name?: string | undefined;
  status: RecipientStatus;
  error?: string | undefined;
  sentAt?: string | undefined; // ISO 8601
  openedAt?: string | undefined; // ISO 8601
  clickedAt?: string | undefined; // ISO 8601
  openCount?: number | undefined;
  clickCount?: number | undefined;
}

// ── Campaign ──────────────────────────────────────────────────────────────────

/** Summary shape for list views — no recipients array */
export interface CampaignSummary {
  id: string;
  subject: string;
  senderName: string;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  totalOpens?: number | undefined;
  totalClicks?: number | undefined;
  /** Recipients who opened at least once (pixel-based estimate); null if not tracked */
  uniqueOpens?: number | null;
  /** Recipients who clicked at least once; null if not tracked */
  uniqueClicks?: number | null;
  /** uniqueOpens / sentCount × 100 (bounded 0–100); null when nothing was sent or not tracked */
  openRate?: number | null;
  /** uniqueClicks / sentCount × 100 (bounded 0–100); null when nothing was sent or not tracked */
  clickRate?: number | null;
  /** Campaign-level failure reason (e.g. SMTP authentication failed) */
  errorMessage?: string | null;
  createdAt: string; // ISO 8601
  scheduledAt?: string | undefined; // ISO 8601 — set when campaign is deferred
  startedAt?: string | undefined;
  completedAt?: string | undefined;
}

/** Full campaign detail including recipients */
export interface CampaignDetail extends CampaignSummary {
  body: string;
  recipients: CampaignRecipient[];
}

// ── Dashboard stats ───────────────────────────────────────────────────────────

export interface DashboardStats {
  totalCampaigns: number;
  /** Messages accepted by the SMTP server (not proof of inbox delivery) */
  totalEmailsSent: number;
  totalEmailsFailed: number;
  /** Sum of per-campaign recipient counts — NOT unique people across campaigns */
  totalRecipients: number;
  /** Recipients not yet attempted (scheduled or in-progress campaigns) */
  totalEmailsPending: number;
  campaignsByStatus: Record<CampaignStatus, number>;
  /** null when no campaign has tracking data (migration not applied) */
  uniqueOpens: number | null;
  uniqueClicks: number | null;
}

// ── Parse preview response ────────────────────────────────────────────────────

export interface ParsePreviewResponse {
  recipients: RecipientPreview[];
  /** Unique, valid addresses that will be sent to */
  totalValid: number;
  /** Rows/addresses that failed validation (missing or malformed) */
  totalInvalid: number;
  columns: string[];
  fileInfo: FileInfo;
  /** Repeated addresses that will be skipped (case/whitespace-insensitive) */
  duplicateCount: number;
  duplicates: DuplicateRecipient[];
  columnMappings: ColumnMapping[];
}

/** Response from POST /campaigns/send and /campaigns/schedule */
export interface CampaignCreateResult {
  campaignId: string;
  recipientCount: number;
  skipped: { invalid: number; duplicates: number };
  message: string;
  scheduledAt?: string;
}

// ── SSE event shapes ──────────────────────────────────────────────────────────

export interface CampaignStartEvent {
  campaignId: string;
  total: number;
  subject: string;
}

export interface CampaignProgressEvent {
  sent: number;
  failed: number;
  total: number;
  email: string;
  status: 'sent' | 'failed';
  reason?: string;
}

export interface CampaignCompleteEvent {
  campaignId: string;
  total: number;
  sent: number;
  failed: number;
  errors: { email: string; reason: string }[];
}
