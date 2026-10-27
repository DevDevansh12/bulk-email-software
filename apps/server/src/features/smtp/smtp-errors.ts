/**
 * SMTP error classification — pure helpers (no I/O) so they can be unit tested.
 *
 * Nodemailer errors carry:
 *   code          — 'EAUTH' | 'ECONNECTION' | 'ETIMEDOUT' | 'ESOCKET' | 'EDNS' | 'EENVELOPE' | 'EMESSAGE' | 'ETLS' ...
 *   command       — the SMTP stage that failed: 'CONN', 'EHLO', 'AUTH PLAIN', 'MAIL FROM', 'RCPT TO', 'DATA', ...
 *   responseCode  — numeric SMTP reply code (e.g. 535, 550, 421) when the server answered
 *   response      — raw server reply text
 * None of these contain the SMTP password.
 */

export interface SmtpErrorLike {
  code?: string | undefined;
  command?: string | undefined;
  responseCode?: number | undefined;
  response?: string | undefined;
  message?: string | undefined;
}

export type SmtpErrorCategory =
  | 'auth'
  | 'connection'
  | 'timeout'
  | 'tls'
  | 'dns'
  | 'sender_rejected'
  | 'recipient_rejected'
  | 'rate_limited'
  | 'message_rejected'
  | 'unknown';

export interface SmtpErrorInfo {
  category: SmtpErrorCategory;
  /** Safe, actionable message for the user (never contains credentials) */
  message: string;
  code?: string | undefined;
  responseCode?: number | undefined;
  command?: string | undefined;
}

function asSmtpError(err: unknown): SmtpErrorLike {
  if (err && typeof err === 'object') return err;
  return { message: String(err) };
}

/** Server reply trimmed to one line; credentials are never echoed by SMTP servers. */
function serverReply(e: SmtpErrorLike): string {
  const text = (e.response ?? e.message ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

export function classifySmtpError(err: unknown): SmtpErrorInfo {
  const e = asSmtpError(err);
  const code = e.code;
  const rc = e.responseCode;
  const cmd = (e.command ?? '').toUpperCase();
  const reply = serverReply(e);
  const meta = { code, responseCode: rc, command: e.command };

  if (code === 'EAUTH' || rc === 535 || rc === 534 || rc === 530) {
    return {
      ...meta,
      category: 'auth',
      message:
        'SMTP authentication failed. Check the username and password. Gmail/Outlook/Yahoo usually require an app password ' +
        `(not your normal password) and 2-step verification. Server said: ${reply}`,
    };
  }
  if (code === 'EDNS') {
    return { ...meta, category: 'dns', message: `SMTP host could not be resolved. Check the host name for typos. (${reply})` };
  }
  if (code === 'ETLS' || /wrong version number|ssl routines|certificate|self[- ]signed/i.test(reply)) {
    return {
      ...meta,
      category: 'tls',
      message:
        'TLS handshake failed. Use port 465 for implicit SSL or port 587 for STARTTLS — mixing them up is the most ' +
        `common cause. (${reply})`,
    };
  }
  if (code === 'ETIMEDOUT' || /timeout/i.test(reply)) {
    return {
      ...meta,
      category: 'timeout',
      message:
        'Timed out talking to the SMTP server. The host/port may be wrong, or your hosting provider may block outbound ' +
        `SMTP ports (25/465/587). (${reply})`,
    };
  }
  if (code === 'ECONNECTION' || code === 'ESOCKET' || code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return {
      ...meta,
      category: 'connection',
      message: `Could not connect to the SMTP server. Check host and port, and that outbound SMTP is allowed. (${reply})`,
    };
  }
  if (rc === 421 || rc === 450 || rc === 451 || rc === 452 || rc === 454 || /rate|too many|quota|limit exceeded/i.test(reply)) {
    return {
      ...meta,
      category: 'rate_limited',
      message: `The SMTP server is temporarily refusing mail (rate limit or sending quota). Try again later. (${reply})`,
    };
  }
  if (cmd.startsWith('MAIL FROM') || /sender|from address|send ?as|not owned|relay/i.test(reply)) {
    return {
      ...meta,
      category: 'sender_rejected',
      message:
        'The SMTP server rejected the sender address. Most providers only allow sending From the authenticated mailbox ' +
        `or a verified alias/domain — set "From Email" accordingly. (${reply})`,
    };
  }
  if (cmd.startsWith('RCPT TO') || code === 'EENVELOPE') {
    return { ...meta, category: 'recipient_rejected', message: `The SMTP server rejected this recipient address. (${reply})` };
  }
  if (cmd === 'DATA' || code === 'EMESSAGE' || (rc !== undefined && rc >= 550)) {
    return { ...meta, category: 'message_rejected', message: `The SMTP server rejected the message. (${reply})` };
  }
  return { ...meta, category: 'unknown', message: reply || 'Unknown SMTP error' };
}

/** SMTP stages that happen before the server could have accepted the message body. */
const PRE_ACCEPTANCE_COMMAND = /^(CONN|EHLO|HELO|LHLO|STARTTLS|AUTH|MAIL FROM|RCPT TO)\b/i;
const TRANSIENT_NETWORK_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNRESET', 'ECONNREFUSED']);

/**
 * Whether resending is safe, i.e. it cannot produce a duplicate email.
 *
 * Only failures in a stage *before* DATA qualify: the server never received
 * the message, so a retry cannot deliver it twice. Anything during or after
 * DATA (or with an unknown stage) may already have been accepted, so we never
 * retry it. Permanent errors (auth, 5xx) are not retried either — they won't
 * fix themselves and repeated auth failures can get an account locked.
 */
export function isSafeToRetrySmtpError(err: unknown): boolean {
  const e = asSmtpError(err);
  if (e.code === 'EAUTH' || e.code === 'EENVELOPE') return false;

  const cmd = e.command ?? '';
  if (!PRE_ACCEPTANCE_COMMAND.test(cmd)) return false;

  if (typeof e.responseCode === 'number') {
    return e.responseCode >= 400 && e.responseCode < 500; // 4xx = transient by SMTP definition
  }
  return e.code !== undefined && TRANSIENT_NETWORK_CODES.has(e.code);
}

/** Timeouts so a dead server fails fast instead of hanging a campaign. */
export const SMTP_TIMEOUTS = {
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
  socketTimeout: 60_000, // generous: large attachments upload during DATA
};

/**
 * Nodemailer transport security options for a port.
 *   465 → implicit TLS
 *   587 → STARTTLS required (never authenticate over plaintext)
 *   other (25, 2525, …) → opportunistic STARTTLS
 */
export function tlsOptionsForPort(host: string, port: number): {
  secure: boolean;
  requireTLS: boolean;
  tls: { servername: string; minVersion: 'TLSv1.2' };
} {
  return {
    secure: port === 465,
    requireTLS: port === 587,
    tls: { servername: host, minVersion: 'TLSv1.2' },
  };
}
