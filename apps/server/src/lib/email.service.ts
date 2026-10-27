/**
 * Transactional email service — Nodemailer.
 *
 * DESIGN:
 * - Single EmailService class, one transport instance (connection pooled)
 * - In development: uses Ethereal.email (auto-generated fake SMTP) — no real emails sent
 * - In production: connects to configured SMTP (SendGrid, AWS SES, Postmark, etc.)
 * - All email templates are co-located here — move to a template engine (MJML, react-email)
 *   when the design team needs custom HTML emails
 *
 * WHY not a third-party SDK (SendGrid, Resend):
 * - SMTP is transport-agnostic — swap providers by changing env vars
 * - No vendor lock-in at the service layer
 * - Nodemailer handles connection pooling, retries, and queuing
 *
 * PRODUCTION NOTE: For high-volume sends (bulk campaigns), this service
 * should be replaced by a queue-backed worker (Bull + Redis) to avoid
 * blocking the HTTP request cycle. This is appropriate for transactional
 * auth emails only.
 */
import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../config/env.js';
import { SMTP_TIMEOUTS, tlsOptionsForPort } from '../features/smtp/smtp-errors.js';

import { escapeHtml } from './html-escape.js';
import { logger } from './logger.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromAddress?: string | undefined; // override the default EMAIL_FROM
  attachments?: any[] | undefined;
}

/** True when real system SMTP credentials are configured (vs. the dev Ethereal fallback). */
export function isSystemSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST);
}

class EmailService {
  // Promise cache so concurrent first sends don't create several transports/test accounts
  private transporterPromise: Promise<Transporter> | null = null;

  /** The shared system transporter. Callers must NOT close it. */
  getSystemTransporter(): Promise<Transporter> {
    if (!this.transporterPromise) {
      this.transporterPromise = this.createSystemTransporter().catch((err) => {
        this.transporterPromise = null; // allow a later retry
        throw err;
      });
    }
    return this.transporterPromise;
  }

  private async createSystemTransporter(): Promise<Transporter> {
    if (!env.SMTP_HOST) {
      if (env.NODE_ENV === 'production') {
        // Never fake delivery in production
        throw new Error('System SMTP is not configured (SMTP_HOST is empty).');
      }
      // Development only: Ethereal test inbox — emails are inspectable at
      // https://ethereal.email but never delivered to real inboxes
      const testAccount = await nodemailer.createTestAccount();
      logger.warn({ user: testAccount.user }, 'SMTP_HOST not set — using Ethereal TEST inbox; emails are NOT delivered');
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
        ...SMTP_TIMEOUTS,
      });
    }

    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      ...tlsOptionsForPort(env.SMTP_HOST, env.SMTP_PORT),
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      ...SMTP_TIMEOUTS,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
  }

  async send(options: EmailOptions): Promise<void> {
    const transport = await this.getSystemTransporter();

    try {
      const info = await transport.sendMail({
        // Address object lets Nodemailer encode names containing quotes/unicode safely
        from: {
          name: options.fromName ?? (env.NODE_ENV === 'production' ? 'Bulk Email Platform' : '[Dev] Bulk Email Platform'),
          address: options.fromAddress ?? env.EMAIL_FROM,
        },
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text ?? options.html.replace(/<[^>]+>/g, ''), // Fallback plain text
        attachments: options.attachments,
      });

      if (!env.SMTP_HOST) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        logger.info({ previewUrl, subject: options.subject }, '📧 Ethereal test email preview URL (not delivered)');
      } else {
        logger.info({ messageId: info.messageId }, 'Email sent');
      }
    } catch (err) {
      // The caller decides whether the email is critical enough to surface to the user.
      logger.error({ code: (err as { code?: string }).code, subject: options.subject }, 'Failed to send email');
      throw err;
    }
  }

  // ── Auth email templates ───────────────────────────────────────────────────

  async sendEmailVerification(to: string, firstName: string, token: string): Promise<void> {
    const verifyUrl = `${env.CLIENT_URL}/auth/verify-email?token=${token}`;

    await this.send({
      to,
      subject: 'Verify your email address',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
            <h2>Welcome, ${escapeHtml(firstName)}!</h2>
            <p>Thanks for signing up. Please verify your email address to activate your account.</p>
            <p>
              <a href="${verifyUrl}"
                 style="display:inline-block;background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
                Verify Email
              </a>
            </p>
            <p style="color:#666;font-size:14px;">
              Or copy this link: <br/>
              <code style="word-break:break-all;">${verifyUrl}</code>
            </p>
            <p style="color:#666;font-size:14px;">This link expires in <strong>24 hours</strong>.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
            <p style="color:#999;font-size:12px;">If you didn't create an account, you can safely ignore this email.</p>
          </body>
        </html>
      `,
    });
  }

  async sendPasswordReset(to: string, firstName: string, token: string): Promise<void> {
    const resetUrl = `${env.CLIENT_URL}/auth/reset-password?token=${token}`;

    await this.send({
      to,
      subject: 'Reset your password',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
            <h2>Password Reset Request</h2>
            <p>Hi ${escapeHtml(firstName)}, we received a request to reset your password.</p>
            <p>
              <a href="${resetUrl}"
                 style="display:inline-block;background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
                Reset Password
              </a>
            </p>
            <p style="color:#666;font-size:14px;">
              Or copy this link: <br/>
              <code style="word-break:break-all;">${resetUrl}</code>
            </p>
            <p style="color:#666;font-size:14px;">This link expires in <strong>1 hour</strong>.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
            <p style="color:#999;font-size:12px;">
              If you didn't request a password reset, please ignore this email. 
              Your password will not be changed.
            </p>
          </body>
        </html>
      `,
    });
  }

  async sendPasswordChangedNotification(to: string, firstName: string): Promise<void> {
    await this.send({
      to,
      subject: 'Your password was changed',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
            <h2>Password Changed</h2>
            <p>Hi ${escapeHtml(firstName)}, your password was successfully changed.</p>
            <p>If you didn't make this change, please 
              <a href="${env.CLIENT_URL}/auth/forgot-password">reset your password immediately</a> 
              and contact support.
            </p>
            <p style="color:#999;font-size:12px;">
              This is an automated security notification. Please do not reply to this email.
            </p>
          </body>
        </html>
      `,
    });
  }
}

// Singleton — one transporter per process
export const emailService = new EmailService();
