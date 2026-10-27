/**
 * SMTP Settings Controller
 *
 * Handles CRUD for per-user SMTP configuration.
 */
import type { Request, Response } from 'express';

import { createError } from '../../lib/app-error.js';

import * as SmtpService from './smtp.service.js';

// ── Validation helpers ────────────────────────────────────────────────────────

/**
 * smtpPass may be blank: the service then keeps (save) or uses (test) the
 * already-saved password, and rejects the request if none is saved.
 */
function parseSmtpBody(body: Record<string, unknown>): SmtpService.SmtpConfigInput {
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName } = body as Record<string, string>;

  if (!smtpHost?.trim()) throw createError.badRequest('smtpHost is required');
  if (!smtpUser?.trim()) throw createError.badRequest('smtpUser is required');
  if (!fromEmail?.trim()) throw createError.badRequest('fromEmail is required');
  if (/[\s/:]/.test(smtpHost.trim())) {
    throw createError.badRequest('smtpHost must be a host name only (e.g. smtp.gmail.com) — no protocol, port or spaces');
  }

  const port = parseInt(String(smtpPort ?? '587'), 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw createError.badRequest('smtpPort must be a valid port number (1–65535)');
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail.trim())) {
    throw createError.badRequest('fromEmail must be a valid email address');
  }

  return {
    smtpHost: smtpHost.trim(),
    smtpPort: port,
    smtpUser: smtpUser.trim(),
    smtpPass: String(smtpPass ?? '').trim(),
    fromEmail: fromEmail.trim(),
    fromName: String(fromName ?? '').trim(),
  };
}

// ── Controller ────────────────────────────────────────────────────────────────

export class SmtpController {
  /** GET /smtp — return user's saved settings (password masked) */
  get = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const settings = await SmtpService.getSmtpSettings(userId);

    res.status(200).json({
      success: true,
      data: settings, // null means "using system default"
    });
  };

  /** POST /smtp — save/update user's SMTP settings */
  save = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const config = parseSmtpBody(req.body);
    const settings = await SmtpService.saveSmtpSettings(userId, config);

    res.status(200).json({
      success: true,
      data: settings,
      message: 'SMTP settings saved. Use "Test Connection" to verify they work.',
    });
  };

  /** POST /smtp/test — verify credentials without saving (blank password = saved password) */
  test = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const config = parseSmtpBody(req.body);
    const result = await SmtpService.testSmtpConnection(config, userId);

    // 200 regardless — the body carries the connection result. Server-side
    // failures (e.g. DB errors) throw and return a 5xx instead.
    res.status(200).json({
      success: true,
      data: result,
    });
  };

  /** DELETE /smtp — remove settings, revert to system default */
  remove = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    await SmtpService.deleteSmtpSettings(userId);

    res.status(200).json({
      success: true,
      message: 'SMTP settings removed. Campaigns will now use the system default email.',
    });
  };
}
