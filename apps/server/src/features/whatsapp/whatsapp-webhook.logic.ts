/**
 * Pure webhook logic (no I/O) — unit tested.
 *
 * 1. Signature verification: Meta signs every POST with HMAC-SHA256 of the raw
 *    body using the App Secret, sent as `X-Hub-Signature-256: sha256=<hex>`.
 * 2. Status transitions: Meta may deliver callbacks more than once and out of
 *    order. Transitions only move forward (pending → sent → delivered → read),
 *    so replays are no-ops and counters derived from recipient rows can't inflate.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { WhatsAppRecipientStatus } from '@saas/shared';

export function verifyMetaSignature(rawBody: Buffer | undefined, header: string | undefined, appSecret: string): boolean {
  if (!rawBody || !header || !appSecret) return false;
  const [scheme, signature] = header.split('=', 2);
  if (scheme !== 'sha256' || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export interface RecipientDeliveryState {
  status: WhatsAppRecipientStatus | string;
  delivered_at: string | null;
  read_at: string | null;
  error: string | null;
}

export interface MetaStatusError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

export interface MetaStatusEvent {
  id: string; // wamid
  status: string; // sent | delivered | read | failed | (others ignored)
  timestamp?: string; // unix seconds
  recipient_id?: string;
  errors?: MetaStatusError[];
}

const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };

export function eventTimestamp(event: MetaStatusEvent, now: Date = new Date()): string {
  const seconds = Number(event.timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : now.toISOString();
}

export function describeStatusError(errors: MetaStatusError[] | undefined): { error: string; errorCode: string | null } {
  const first = errors?.[0];
  if (!first) return { error: 'Meta reported the message as failed', errorCode: null };
  const text = [first.title, first.error_data?.details ?? first.message].filter(Boolean).join(': ');
  return { error: text || 'Meta reported the message as failed', errorCode: first.code !== undefined ? String(first.code) : null };
}

/**
 * Columns to update for this event, or null when the event changes nothing
 * (duplicate, stale, out-of-order regression, simulated row, unknown status).
 */
export function computeStatusUpdate(
  current: RecipientDeliveryState,
  event: MetaStatusEvent,
  now: Date = new Date()
): Record<string, string | null> | null {
  if (current.status === 'simulated') return null;
  const ts = eventTimestamp(event, now);
  const currentRank = RANK[current.status] ?? -1; // failed / unknown = -1

  switch (event.status) {
    case 'sent':
      return current.status === 'pending' ? { status: 'sent' } : null;

    case 'delivered':
      if (currentRank >= 2) {
        // read arrived first: backfill delivered_at once, keep status
        return current.delivered_at ? null : { delivered_at: ts };
      }
      // Positive delivery evidence also supersedes an earlier failure
      return { status: 'delivered', delivered_at: current.delivered_at ?? ts };

    case 'read':
      if (current.status === 'read') return null;
      return { status: 'read', read_at: ts, delivered_at: current.delivered_at ?? ts };

    case 'failed': {
      if (currentRank >= 2) return null; // already delivered — ignore a late/duplicate failure
      const { error, errorCode } = describeStatusError(event.errors);
      if (current.status === 'failed' && current.error === error) return null;
      return { status: 'failed', error, error_code: errorCode };
    }

    default:
      return null;
  }
}
