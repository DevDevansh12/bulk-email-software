/**
 * WhatsApp recipient list builder — one implementation for preview and send,
 * so a file cannot bypass validation or duplicate filtering at send time.
 *
 * - Phone numbers are normalized to E.164 digits (see normalizePhone)
 * - The same number (after normalization) is sent at most once; later rows are skipped
 * - In template mode every template variable must map to a non-empty column value
 */
import {
  normalizePhone,
  type WhatsAppParsePreviewResponse,
  type WhatsAppRecipientPreview,
} from '@saas/shared';

import type { ParsedSheet } from '../../lib/spreadsheet.js';

export interface WhatsAppRecipientOptions {
  phoneColumn?: string | undefined;
  nameColumn?: string | undefined;
  defaultCountryCode?: string | undefined;
  /** Template variables in parameter order (template mode only) */
  variables?: string[] | undefined;
  /** variable name → CSV column */
  variableColumns?: Record<string, string> | undefined;
}

export interface BuiltWhatsAppRecipient {
  phone: string;
  name?: string | undefined;
  rowNumber: number;
  /** Template parameter values in variable order */
  variableValues: string[];
  /** All row values (lower-cased headers) for free-text {{column}} substitution */
  mergeData: Record<string, string>;
}

export interface WhatsAppRecipientList extends WhatsAppParsePreviewResponse {
  sendable: BuiltWhatsAppRecipient[];
}

const PHONE_HEADER = /phone|mobile|whatsapp|msisdn|cell|number|num/i;
const NAME_HEADER = /^(name|full[_ ]?name|first[_ ]?name|firstname|contact[_ ]?name)$/i;

export function detectPhoneColumn(headers: string[]): string | null {
  return headers.find((h) => h === 'phone') ?? headers.find((h) => PHONE_HEADER.test(h)) ?? null;
}

export function detectNameColumn(headers: string[]): string | null {
  return headers.find((h) => NAME_HEADER.test(h)) ?? headers.find((h) => /name/i.test(h)) ?? null;
}

/** Meta rejects template parameters containing new lines, tabs, or more than 4 consecutive spaces (error 132007). */
function invalidParameterReason(value: string): string | null {
  if (/[\n\r\t]/.test(value)) return 'contains new lines or tabs';
  if (/ {5,}/.test(value)) return 'contains more than 4 consecutive spaces';
  if (value.length > 1024) return 'is longer than 1024 characters';
  return null;
}

export function buildWhatsAppRecipients(
  sheet: Pick<ParsedSheet, 'headers' | 'rows'>,
  options: WhatsAppRecipientOptions = {}
): WhatsAppRecipientList {
  const headers = sheet.headers;
  const pick = (requested: string | undefined, detected: string | null) => {
    const col = requested?.trim().toLowerCase();
    return col && headers.includes(col) ? col : detected;
  };
  const phoneColumn = pick(options.phoneColumn, detectPhoneColumn(headers));
  const nameColumn = pick(options.nameColumn, detectNameColumn(headers));
  const variables = options.variables ?? [];
  const variableColumns = options.variableColumns ?? {};

  const recipients: WhatsAppRecipientPreview[] = [];
  const sendable: BuiltWhatsAppRecipient[] = [];
  const firstSeen = new Map<string, number>();
  let invalid = 0;
  let duplicates = 0;

  for (const row of sheet.rows) {
    const rawPhone = phoneColumn ? row.values[phoneColumn] ?? '' : '';
    const name = nameColumn ? row.values[nameColumn]?.trim() || undefined : undefined;
    const base = { rowNumber: row.rowNumber, rawPhone, ...(name && { name }) };

    const normalized = normalizePhone(rawPhone, { defaultCountryCode: options.defaultCountryCode });
    if (!normalized.ok) {
      invalid++;
      recipients.push({ ...base, phone: '', status: 'invalid', valid: false, error: normalized.error });
      continue;
    }
    const phone = normalized.digits;

    // Template variables must all have usable values
    const variableValues: string[] = [];
    let variableError: string | null = null;
    for (const variable of variables) {
      const column = variableColumns[variable];
      const value = column ? (row.values[column.toLowerCase()] ?? '').trim() : '';
      if (!column) {
        variableError = `No column mapped to {{${variable}}}`;
        break;
      }
      if (!value) {
        variableError = `Missing value for {{${variable}}} (column "${column}")`;
        break;
      }
      const bad = invalidParameterReason(value);
      if (bad) {
        variableError = `Value for {{${variable}}} ${bad}`;
        break;
      }
      variableValues.push(value);
    }
    if (variableError) {
      invalid++;
      recipients.push({ ...base, phone, status: 'invalid', valid: false, error: variableError });
      continue;
    }

    const seenAt = firstSeen.get(phone);
    if (seenAt !== undefined) {
      duplicates++;
      recipients.push({
        ...base,
        phone,
        status: 'duplicate',
        valid: false,
        error: `Duplicate of row ${seenAt}`,
        duplicateOfRow: seenAt,
      });
      continue;
    }

    firstSeen.set(phone, row.rowNumber);
    recipients.push({ ...base, phone, status: 'valid', valid: true, ...(variables.length > 0 && { variableValues }) });
    sendable.push({ phone, name, rowNumber: row.rowNumber, variableValues, mergeData: { ...row.values, ...(name && { name }) } });
  }

  return {
    recipients,
    sendable,
    columns: headers,
    phoneColumn,
    nameColumn,
    totalRows: sheet.rows.length,
    totalValid: sendable.length,
    totalInvalid: invalid,
    duplicateCount: duplicates,
  };
}

/** Free-text body with {{column}} placeholders filled from the row. */
export function renderTextBody(body: string, mergeData: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w ]+?)\s*\}\}/g, (match, key: string) => {
    const value = mergeData[key.toLowerCase()];
    if (value) return value;
    return key.toLowerCase() === 'name' ? 'Friend' : match; // same fallback the sender always used
  });
}
