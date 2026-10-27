/**
 * Database connectivity — Supabase edition.
 *
 * Supabase (Postgres) connection is managed by the @supabase/supabase-js client.
 * There is no explicit connect/disconnect needed — the client handles pooling.
 *
 * STARTUP STRATEGY
 * ────────────────
 * The server starts and begins accepting HTTP requests regardless of whether the
 * Supabase health-check succeeds.  This prevents a transient network blip (DNS
 * hiccup, cold-start delay, Hostinger outbound firewall) from causing a hard
 * process.exit(1) that produces a 503 with zero diagnostic information.
 *
 * Instead:
 *  • connectDatabase() logs rich diagnostics and sets a module-level flag.
 *  • If the check fails, the error is logged in full but the process continues.
 *  • isDatabaseHealthy() lets route handlers / health endpoints surface the
 *    real status so Hostinger logs show exactly what is wrong.
 *  • verifyDatabaseOrThrow() is kept for any caller that truly must abort on
 *    failure (not used during bootstrap — kept for future use).
 */
import { supabaseAdmin } from './supabase.js';
import { env } from './env.js';
import { logger } from '../lib/logger.js';

// ── Module-level health state ─────────────────────────────────────────────────

let _healthy = false;
let _lastError: string | null = null;

export function isDatabaseHealthy(): boolean {
  return _healthy;
}

export function getDatabaseError(): string | null {
  return _lastError;
}

// ── Diagnostic helpers (log shape, never log secret values) ──────────────────

function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Show protocol + hostname only — never query params or credentials
    return `${u.protocol}//${u.hostname}`;
  } catch {
    if (!raw || raw.trim() === '') return '<empty>';
    if (raw.startsWith('http')) return raw.slice(0, 30) + '…';
    return '<non-url value>';
  }
}

function classifyFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const msg = err.message.toLowerCase();
  const cause = (err as NodeJS.ErrnoException).cause;
  const causeMsg =
    cause instanceof Error ? cause.message.toLowerCase() : '';
  const causeCode =
    cause != null && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : '';

  if (causeCode === 'ENOTFOUND' || causeMsg.includes('getaddrinfo'))
    return `DNS_RESOLUTION_FAILURE — the hostname in SUPABASE_URL could not be resolved. Check that SUPABASE_URL is correct and that outbound DNS is available on this server. (cause: ${causeMsg || causeCode})`;

  if (causeCode === 'ECONNREFUSED')
    return `CONNECTION_REFUSED — the server actively refused the connection. (cause: ${causeMsg || causeCode})`;

  if (causeCode === 'ECONNRESET' || causeMsg.includes('connection reset'))
    return `CONNECTION_RESET — the connection was reset mid-flight. Likely a network/firewall issue. (cause: ${causeMsg || causeCode})`;

  if (causeCode === 'ETIMEDOUT' || causeMsg.includes('timed out') || msg.includes('timed out'))
    return `CONNECTION_TIMEOUT — the request timed out. Hostinger may be blocking outbound HTTPS to supabase.co. (cause: ${causeMsg || causeCode})`;

  if (msg.includes('fetch failed'))
    return `FETCH_FAILED — native fetch threw. This typically means DNS failure, network blocked, or invalid URL. cause: ${causeMsg || causeCode || 'none'}`;

  if (msg.includes('invalid url') || msg.includes('only absolute'))
    return `INVALID_URL — the value in SUPABASE_URL is not a valid absolute URL.`;

  return err.message;
}

// ── connectDatabase ───────────────────────────────────────────────────────────

/**
 * Runs the Supabase health-check and sets the module-level health flag.
 *
 * On failure the error is logged with full diagnostics but the function
 * resolves (does NOT throw).  The server continues to start so that:
 *   1. The process doesn't vanish, giving Hostinger logs a chance to flush.
 *   2. The /health endpoint can report the real failure reason over HTTP.
 *   3. If the failure is a transient startup race, requests that arrive after
 *      Supabase recovers will succeed normally.
 */
export async function connectDatabase(): Promise<void> {
  const rawUrl: string = env.SUPABASE_URL;

  logger.info(
    {
      supabase_url_shape: redactUrl(rawUrl),
      supabase_url_starts_with_https: rawUrl.startsWith('https://'),
      supabase_url_length: rawUrl.length,
      supabase_anon_key_present: Boolean(env.SUPABASE_ANON_KEY),
      supabase_service_key_present: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      supabase_jwt_secret_present: Boolean(env.SUPABASE_JWT_SECRET),
      node_version: process.version,
      platform: process.platform,
    },
    'Supabase connection diagnostics'
  );

  // Basic URL sanity check before touching the network
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') {
      const msg = `SUPABASE_URL must use https:// — got "${u.protocol}"`;
      logger.error({ supabase_url_shape: redactUrl(rawUrl) }, msg);
      _healthy = false;
      _lastError = msg;
      return;
    }
  } catch {
    const msg = `SUPABASE_URL is not a valid URL (value shape: "${redactUrl(rawUrl)}")`;
    logger.error({ supabase_url_shape: redactUrl(rawUrl) }, msg);
    _healthy = false;
    _lastError = msg;
    return;
  }

  // Network health-check
  try {
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });

    if (error) {
      // Supabase responded but returned an API error (wrong key, paused project, etc.)
      const msg = `Supabase API error: ${error.message} (status ${error.status ?? 'unknown'})`;
      logger.error(
        {
          supabase_error_message: error.message,
          supabase_error_status: error.status,
          supabase_url_shape: redactUrl(rawUrl),
          hint: error.status === 401 || error.status === 403
            ? 'CHECK: SUPABASE_SERVICE_ROLE_KEY may be wrong or the project may be paused'
            : error.status === 404
            ? 'CHECK: SUPABASE_URL may point to a non-existent project'
            : 'CHECK: Supabase project status at https://app.supabase.com',
        },
        'Supabase health-check failed — server will continue but DB calls may fail'
      );
      _healthy = false;
      _lastError = msg;
      return;
    }

    _healthy = true;
    _lastError = null;
    logger.info({ supabase_url_shape: redactUrl(rawUrl) }, 'Supabase connected successfully');
  } catch (err: unknown) {
    const classified = classifyFetchError(err);
    const msg = `Supabase unreachable: ${classified}`;

    logger.error(
      {
        classified_error: classified,
        supabase_url_shape: redactUrl(rawUrl),
        node_version: process.version,
        hint_1: 'Verify SUPABASE_URL is set correctly in Hostinger environment variables',
        hint_2: 'Verify outbound HTTPS (port 443) to *.supabase.co is not blocked by Hostinger firewall',
        hint_3: 'Verify the Supabase project is not paused at https://app.supabase.com',
        hint_4: 'Node.js >= 18 is required for native fetch — check node --version on the server',
      },
      'Supabase health-check threw — server will continue but DB calls may fail'
    );

    _healthy = false;
    _lastError = msg;
    // Intentionally do NOT re-throw — server must start so logs are visible over HTTP
  }
}

/** Throws if the last health-check did not pass. Use in critical middleware if needed. */
export async function verifyDatabaseOrThrow(): Promise<void> {
  if (!_healthy) {
    throw new Error(_lastError ?? 'Supabase is not connected');
  }
}

/** No-op — Supabase client manages its own connection lifecycle */
export async function disconnectDatabase(): Promise<void> {
  logger.info('Supabase client released');
}
