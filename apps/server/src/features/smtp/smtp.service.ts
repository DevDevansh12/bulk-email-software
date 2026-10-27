/**
 * SMTP Settings Service
 *
 * Handles per-user SMTP configuration stored in Supabase.
 * Used by the campaigns service to resolve which SMTP credentials
 * to use when sending bulk emails.
 *
 * Provider selection (see smtp-provider.ts):
 *   user_smtp_settings row exists → use user's SMTP
 *   no row                        → system .env SMTP
 *   lookup failed                 → error (never silently switch servers)
 *
 * Secrets: smtp_pass is read only by server-side functions in this file and is
 * never logged or returned to the client.
 */
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';

import { supabaseAdmin } from '../../config/supabase.js';
import { createError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';

import { classifySmtpError, isSafeToRetrySmtpError, SMTP_TIMEOUTS, tlsOptionsForPort } from './smtp-errors.js';
import { isSameSmtpConnection, type SmtpConfig, type SmtpSettingsLookup } from './smtp-provider.js';

export type { SmtpConfig } from './smtp-provider.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SmtpSettingsRow {
  id: string;
  userId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  fromEmail: string;
  fromName: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  // smtpPass intentionally omitted from public-facing type
}

/** Form input — smtpPass may be empty to mean "keep the saved password". */
export type SmtpConfigInput = SmtpConfig;

export interface SmtpTestResult {
  success: boolean;
  message: string;
  /** true only when the tested credentials are the saved ones AND that was recorded */
  savedSettingsVerified: boolean;
}

const PUBLIC_COLUMNS =
  'id, user_id, smtp_host, smtp_port, smtp_user, from_email, from_name, is_verified, created_at, updated_at';

interface SmtpRow {
  id: string;
  user_id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  from_email: string;
  from_name: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

function toPublicRow(data: SmtpRow): SmtpSettingsRow {
  return {
    id: data.id,
    userId: data.user_id,
    smtpHost: data.smtp_host,
    smtpPort: data.smtp_port,
    smtpUser: data.smtp_user,
    fromEmail: data.from_email,
    fromName: data.from_name,
    isVerified: data.is_verified,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ── Service functions ─────────────────────────────────────────────────────────

/** Fetch the user's SMTP settings (password masked). Returns null if not set. */
export async function getSmtpSettings(userId: string): Promise<SmtpSettingsRow | null> {
  const { data, error } = await supabaseAdmin
    .from('user_smtp_settings')
    .select(PUBLIC_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error({ dbError: error.message, userId }, 'Failed to fetch SMTP settings');
    throw createError.internal('Failed to fetch SMTP settings');
  }

  return data ? toPublicRow(data) : null;
}

/**
 * Look up the SMTP settings including the password (server-only).
 * Distinguishes "not configured" from "lookup failed" — callers must not
 * treat a database error as "no settings".
 */
export async function lookupSmtpSettingsWithPassword(
  userId: string
): Promise<SmtpSettingsLookup & { updatedAt?: string }> {
  const { data, error } = await supabaseAdmin
    .from('user_smtp_settings')
    .select('smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error({ dbError: error.message, userId }, 'SMTP settings lookup failed');
    return { status: 'error', error };
  }
  if (!data) return { status: 'not_found' };

  return {
    status: 'found',
    updatedAt: data.updated_at as string,
    config: {
      smtpHost: data.smtp_host,
      smtpPort: data.smtp_port,
      smtpUser: data.smtp_user,
      smtpPass: data.smtp_pass,
      fromEmail: data.from_email,
      fromName: data.from_name,
    },
  };
}

/**
 * Upsert SMTP settings for the user.
 * - An empty smtpPass keeps the currently saved password.
 * - is_verified is reset whenever the connection details change, so the
 *   "verified" badge always describes the credentials actually saved.
 */
export async function saveSmtpSettings(userId: string, input: SmtpConfigInput): Promise<SmtpSettingsRow> {
  const existing = await lookupSmtpSettingsWithPassword(userId);
  if (existing.status === 'error') {
    throw createError.internal('Could not load existing SMTP settings. Nothing was saved — please retry.');
  }

  let smtpPass = input.smtpPass;
  if (!smtpPass) {
    if (existing.status !== 'found') {
      throw createError.badRequest('smtpPass is required');
    }
    smtpPass = existing.config.smtpPass;
  }

  const config: SmtpConfig = { ...input, smtpPass };
  const connectionUnchanged = existing.status === 'found' && isSameSmtpConnection(existing.config, config);

  const row: Record<string, unknown> = {
    user_id: userId,
    smtp_host: config.smtpHost,
    smtp_port: config.smtpPort,
    smtp_user: config.smtpUser,
    smtp_pass: config.smtpPass,
    from_email: config.fromEmail,
    from_name: config.fromName,
  };
  if (!connectionUnchanged) row['is_verified'] = false;

  const { data, error } = await supabaseAdmin
    .from('user_smtp_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select(PUBLIC_COLUMNS)
    .single();

  if (error || !data) {
    logger.error({ dbError: error?.message, userId }, 'Failed to save SMTP settings');
    throw createError.internal('Failed to save SMTP settings');
  }

  logger.info(
    { userId, smtpHost: config.smtpHost, smtpPort: config.smtpPort, verificationReset: !connectionUnchanged },
    'SMTP settings saved'
  );
  return toPublicRow(data);
}

/** Delete the user's SMTP settings (they'll fall back to system default). */
export async function deleteSmtpSettings(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('user_smtp_settings').delete().eq('user_id', userId);

  if (error) {
    logger.error({ dbError: error.message, userId }, 'Failed to delete SMTP settings');
    throw createError.internal('Failed to delete SMTP settings');
  }
}

/**
 * Record the verification result for the saved settings — but only if they
 * have not changed since we loaded them (guards against a concurrent save).
 * Returns whether the row was updated.
 */
async function setSavedVerification(userId: string, savedUpdatedAt: string, verified: boolean): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('user_smtp_settings')
    .update({ is_verified: verified })
    .eq('user_id', userId)
    .eq('updated_at', savedUpdatedAt)
    .select('id');

  if (error) {
    logger.error({ dbError: error.message, userId }, 'Failed to update SMTP verification state');
    throw createError.internal('Failed to record SMTP verification state');
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Test an SMTP connection (EHLO + TLS + AUTH) without sending mail.
 *
 * - Blank password in the form → test with the saved password.
 * - The saved settings are marked verified only when the tested credentials
 *   are exactly the saved ones; testing unsaved edits never flips the badge.
 */
export async function testSmtpConnection(input: SmtpConfigInput, userId: string): Promise<SmtpTestResult> {
  const saved = await lookupSmtpSettingsWithPassword(userId);
  if (saved.status === 'error') {
    throw createError.internal('Could not load saved SMTP settings to test. Please retry.');
  }

  let smtpPass = input.smtpPass;
  if (!smtpPass) {
    if (saved.status !== 'found') {
      throw createError.badRequest('Enter the SMTP password to test the connection.');
    }
    smtpPass = saved.config.smtpPass;
  }
  const config: SmtpConfig = { ...input, smtpPass };
  const testsSavedSettings = saved.status === 'found' && isSameSmtpConnection(saved.config, config);

  const transporter = buildTransporter(config, { pool: false, timeoutMs: 10_000 });
  try {
    await transporter.verify();
  } catch (err) {
    const info = classifySmtpError(err);
    logger.warn(
      { userId, smtpHost: config.smtpHost, smtpPort: config.smtpPort, category: info.category, code: info.code, responseCode: info.responseCode, command: info.command },
      'SMTP connection test failed'
    );
    if (testsSavedSettings && saved.updatedAt) {
      await setSavedVerification(userId, saved.updatedAt, false).catch(() => false);
    }
    return { success: false, message: `Connection failed: ${info.message}`, savedSettingsVerified: false };
  } finally {
    transporter.close();
  }

  logger.info({ userId, smtpHost: config.smtpHost, smtpPort: config.smtpPort, testsSavedSettings }, 'SMTP connection test succeeded');

  if (!testsSavedSettings || !saved.updatedAt) {
    return {
      success: true,
      savedSettingsVerified: false,
      message:
        saved.status === 'found'
          ? 'Connection successful with the details in the form. They differ from your saved settings — click "Update Settings" to use them.'
          : 'Connection successful. Click "Save Settings" to use these credentials for campaigns.',
    };
  }

  let recorded: boolean;
  try {
    recorded = await setSavedVerification(userId, saved.updatedAt, true);
  } catch {
    return {
      success: true,
      savedSettingsVerified: false,
      message: 'Connection successful, but the verified status could not be saved. Please test again.',
    };
  }

  return recorded
    ? { success: true, savedSettingsVerified: true, message: 'Connection successful! Your saved SMTP settings are verified.' }
    : {
        success: true,
        savedSettingsVerified: false,
        message: 'Connection successful, but your settings changed during the test. Please test again.',
      };
}

/**
 * Build a Nodemailer transporter from a SmtpConfig with sane TLS and timeouts.
 * Callers that build their own transporter must close() it when done.
 */
export function buildTransporter(
  config: SmtpConfig,
  options: { pool?: boolean; timeoutMs?: number } = {}
): Transporter {
  const pool = options.pool ?? true;
  const timeouts = options.timeoutMs
    ? { connectionTimeout: options.timeoutMs, greetingTimeout: options.timeoutMs, socketTimeout: options.timeoutMs }
    : SMTP_TIMEOUTS;

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    ...tlsOptionsForPort(config.smtpHost, config.smtpPort),
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    ...timeouts,
    ...(pool ? { pool: true, maxConnections: 5, maxMessages: 100 } : {}),
  });
}

const RETRY_DELAYS_MS = [1_000, 3_000];

/**
 * Send one message, retrying only failures that provably happened before the
 * server accepted the message (see isSafeToRetrySmtpError). Errors during or
 * after DATA are never retried — the message may already be delivered.
 */
export async function sendMailWithRetry(
  transporter: Transporter,
  mail: SendMailOptions,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<{ messageId: string; attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const info = await transporter.sendMail(mail);
      return { messageId: String(info.messageId ?? ''), attempts: attempt };
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      if (delay === undefined || !isSafeToRetrySmtpError(err)) throw err;
      await sleep(delay);
    }
  }
}
