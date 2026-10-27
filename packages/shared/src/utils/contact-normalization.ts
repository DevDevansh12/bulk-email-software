/**
 * Contact normalization helpers shared by preview, send, and audience import.
 *
 * WHY shared: preview (client-visible counts) and send (what actually goes out)
 * must apply the exact same rules, otherwise the numbers a user approves in the
 * preview drift from what the server dispatches.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Canonical form used for comparison and storage: trimmed + lower-cased. */
export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/**
 * Split a spreadsheet cell that may hold several addresses
 * ("a@x.com, b@y.com" or "a@x.com; b@y.com") into normalized addresses.
 */
export function splitEmailCell(cell: unknown): string[] {
  return String(cell ?? '')
    .split(/[,;]/)
    .map(normalizeEmail)
    .filter((e) => e.length > 0);
}

// ── Phone numbers ────────────────────────────────────────────────────────────

export type PhoneNormalizationResult =
  | { ok: true; digits: string }
  | { ok: false; error: string };

export interface PhoneNormalizationOptions {
  /**
   * Country calling code (digits only, e.g. "91" or "1") applied to numbers
   * written in national format (leading 0 or 10 digits or fewer, no "+").
   */
  defaultCountryCode?: string | undefined;
}

/**
 * Normalize a phone number to E.164 digits (no "+"), which is the format the
 * WhatsApp Cloud API expects in the `to` field.
 *
 * Rules:
 *   "+44 20 7946 0958" / "0044..."  → international, kept as-is
 *   "919876543210" (no +, > 10 digits) → assumed to already include the country code
 *   "09876543210" / "9876543210"     → national; needs defaultCountryCode
 */
export function normalizePhone(
  raw: unknown,
  options: PhoneNormalizationOptions = {}
): PhoneNormalizationResult {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, error: 'Phone number is missing' };

  // Excel turns long numbers into "9.19876E+11" when the column isn't text
  if (/^\d+(\.\d+)?e\+\d+$/i.test(input)) {
    return { ok: false, error: 'Phone number is in scientific notation — format the column as text and re-export' };
  }

  if (!/^\+?[\d\s\-().]+$/.test(input)) {
    return { ok: false, error: 'Phone number contains invalid characters' };
  }

  const hasPlus = input.startsWith('+');
  let digits = input.replace(/\D/g, '');
  let international = hasPlus;

  if (!hasPlus && digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }

  if (!international) {
    const cc = (options.defaultCountryCode ?? '').replace(/\D/g, '');
    const isNational = digits.startsWith('0') || digits.length <= 10;
    if (isNational) {
      if (!cc) {
        return {
          ok: false,
          error: 'Missing country code — use international format (e.g. +14155550123) or set a default country code',
        };
      }
      digits = cc + digits.replace(/^0+/, '');
    }
  }

  if (digits.startsWith('0')) {
    return { ok: false, error: 'Country code cannot start with 0' };
  }
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, error: 'Phone number must have 7–15 digits including the country code' };
  }

  return { ok: true, digits };
}
