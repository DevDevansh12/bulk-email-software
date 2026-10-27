/**
 * Email recipient list builder — the single source of truth for validation and
 * de-duplication. Used by the preview endpoint, immediate send, scheduled send,
 * and audience import, so the counts a user sees are the counts that are sent.
 *
 * Duplicate policy: an address (trimmed, case-insensitive) is sent at most once
 * per campaign. The first occurrence wins; later ones are reported as skipped.
 */
import {
  isValidEmail,
  splitEmailCell,
  type ColumnMapping,
  type DuplicateRecipient,
  type RecipientPreview,
} from '@saas/shared';

import type { ParsedSheet } from '../../lib/spreadsheet.js';

export const EMAIL_ALIASES = [
  'email', 'e-mail', 'mail', 'email_address', 'email address', 'contact_email', 'emailaddress', 'e_mail',
];
export const NAME_ALIASES = [
  'name', 'first_name', 'firstname', 'full_name', 'fullname', 'contact_name', 'full name', 'first name', 'subscriber_name',
];

export interface BuiltRecipient {
  email: string;
  name?: string | undefined;
  rowNumber: number;
  /** All columns from the row (lower-cased keys) for {{variable}} substitution */
  mergeData: Record<string, string>;
}

export interface RecipientListResult {
  emailColumn: string | null;
  nameColumn: string | null;
  columnMappings: ColumnMapping[];
  /** One entry per address (or per row when the email cell is empty) */
  preview: RecipientPreview[];
  /** Unique, valid recipients in file order — exactly what will be sent */
  recipients: BuiltRecipient[];
  invalidCount: number;
  duplicates: DuplicateRecipient[];
}

export function detectColumnMappings(headers: string[]): ColumnMapping[] {
  let emailFound = false;
  let nameFound = false;
  return headers.map((col) => {
    const normalized = col.toLowerCase().trim();
    if (!emailFound && EMAIL_ALIASES.includes(normalized)) {
      emailFound = true;
      return { original: col, mapped: 'email', autoDetected: true };
    }
    if (!nameFound && NAME_ALIASES.includes(normalized)) {
      nameFound = true;
      return { original: col, mapped: 'name', autoDetected: true };
    }
    return { original: col, mapped: col, autoDetected: false };
  });
}

export function buildEmailRecipients(sheet: Pick<ParsedSheet, 'headers' | 'rows'>): RecipientListResult {
  const columnMappings = detectColumnMappings(sheet.headers);
  const emailColumn = columnMappings.find((m) => m.mapped === 'email')?.original ?? null;
  const nameColumn = columnMappings.find((m) => m.mapped === 'name')?.original ?? null;

  const preview: RecipientPreview[] = [];
  const recipients: BuiltRecipient[] = [];
  const duplicates: DuplicateRecipient[] = [];
  const firstSeen = new Map<string, number>(); // normalized email → row number
  let invalidCount = 0;

  for (const row of sheet.rows) {
    const name = nameColumn ? (row.values[nameColumn] ?? '').trim() : '';
    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(row.values)) {
      if (key === emailColumn || key === nameColumn) continue;
      if (value) extra[key] = value;
    }

    const emails = emailColumn ? splitEmailCell(row.values[emailColumn]) : [];

    if (emails.length === 0) {
      invalidCount++;
      preview.push({
        ...extra,
        email: '',
        ...(name && { name }),
        valid: false,
        status: 'invalid',
        error: 'Email is missing',
        rowNumber: row.rowNumber,
      });
      continue;
    }

    for (const email of emails) {
      const base = { ...extra, email, ...(name && { name }), rowNumber: row.rowNumber };

      if (!isValidEmail(email)) {
        invalidCount++;
        preview.push({ ...base, valid: false, status: 'invalid', error: 'Invalid email format' });
        continue;
      }

      const seenAt = firstSeen.get(email);
      if (seenAt !== undefined) {
        duplicates.push({ email, rowNumber: row.rowNumber, firstSeenRow: seenAt });
        preview.push({
          ...base,
          valid: false,
          status: 'duplicate',
          error: `Duplicate of row ${seenAt}`,
          duplicateOfRow: seenAt,
        });
        continue;
      }

      firstSeen.set(email, row.rowNumber);
      preview.push({ ...base, valid: true, status: 'valid' });
      recipients.push({
        email,
        ...(name && { name }),
        rowNumber: row.rowNumber,
        mergeData: { ...row.values, email, ...(name && { name }) },
      });
    }
  }

  return { emailColumn, nameColumn, columnMappings, preview, recipients, invalidCount, duplicates };
}
