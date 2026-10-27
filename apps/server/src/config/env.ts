/**
 * Environment validation using `envalid`.
 * Supabase replaces MongoDB — all Mongo vars removed.
 */
import { cleanEnv, str, port, bool, num } from 'envalid';

export const env = cleanEnv(process.env, {
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),

  // ── Server ────────────────────────────────────────────────────────────────
  PORT: port({ default: 5000 }),
  API_VERSION: str({ default: 'v1' }),
  CLIENT_URL: str({ default: 'http://localhost:5173' }),
  /**
   * Public-facing server URL — used to build tracking links in campaigns.
   * Set to your Hostinger domain, e.g. https://yourdomain.com
   * Falls back to http://localhost:<PORT> if not set (dev only).
   */
  SERVER_URL: str({ default: '' }),

  // ── Supabase ──────────────────────────────────────────────────────────────
  SUPABASE_URL: str(),
  SUPABASE_ANON_KEY: str(),
  SUPABASE_SERVICE_ROLE_KEY: str(),
  /** Used to verify Supabase-issued JWTs on the server without network calls */
  SUPABASE_JWT_SECRET: str(),

  // ── Token expiry (informational — Supabase manages its own session TTLs) ──
  JWT_ACCESS_EXPIRES_IN: str({ default: '15m' }),

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: num({ default: 15 * 60 * 1000 }),
  RATE_LIMIT_MAX: num({ default: 100 }),

  // ── Logging ───────────────────────────────────────────────────────────────
  LOG_LEVEL: str({
    choices: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    default: 'info',
  }),

  // ── Email (SMTP) ──────────────────────────────────────────────────────────
  SMTP_HOST: str({ default: '' }),
  SMTP_PORT: port({ default: 587 }),
  SMTP_USER: str({ default: '' }),
  SMTP_PASS: str({ default: '' }),
  EMAIL_FROM: str({ default: 'noreply@example.com' }),

  // ── Feature Flags ─────────────────────────────────────────────────────────
  ENABLE_SWAGGER: bool({ default: false }),
  GEMINI_API_KEY: str({ default: '' }),
  OPENAI_API_KEY: str({ default: '' }),

  // ── WhatsApp (System Default) ──────────────────────────────────────────────
  WHATSAPP_PHONE_NUMBER_ID: str({ default: '' }),
  WHATSAPP_ACCESS_TOKEN: str({ default: '' }),
  WHATSAPP_WABA_ID: str({ default: '' }),
  /** Graph API version for all Meta calls. Meta retires versions ~2 years after release. */
  WHATSAPP_GRAPH_API_VERSION: str({ default: 'v23.0' }),
  /** Token you enter in Meta App Dashboard → WhatsApp → Configuration → Webhook. No default on purpose. */
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: str({ default: '' }),
  /** Meta App Secret — verifies X-Hub-Signature-256 on webhook POSTs. Required in production. */
  WHATSAPP_APP_SECRET: str({ default: '' }),
  /**
   * Development only: when no WhatsApp credentials are configured, record sends
   * as clearly-labeled simulations instead of failing. Ignored in production.
   */
  WHATSAPP_SIMULATION_MODE: bool({ default: false }),

  // ── Cron Jobs ─────────────────────────────────────────────────────────────
  CRON_SECRET: str({ default: '' }),
});

export type Env = typeof env;
