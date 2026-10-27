/**
 * SMTP provider selection — pure logic, unit tested.
 *
 * The rule is explicit so a transient database error can never silently
 * switch a user's campaign onto a different mail server:
 *   lookup found a row   → user's SMTP
 *   lookup found no row  → system SMTP (if configured)
 *   lookup failed        → error (do not guess)
 */

export interface SmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  fromName: string;
}

export type SmtpSettingsLookup =
  | { status: 'found'; config: SmtpConfig }
  | { status: 'not_found' }
  | { status: 'error'; error: unknown };

export type SmtpProviderSelection =
  | { kind: 'user'; config: SmtpConfig }
  | { kind: 'system' }
  | { kind: 'unavailable'; reason: string };

export function selectSmtpProvider(
  lookup: SmtpSettingsLookup,
  system: { configured: boolean; isProduction: boolean }
): SmtpProviderSelection {
  if (lookup.status === 'error') {
    return {
      kind: 'unavailable',
      reason:
        'Could not load your SMTP settings (database error). The campaign was not sent through a different server — please retry.',
    };
  }
  if (lookup.status === 'found') {
    return { kind: 'user', config: lookup.config };
  }
  // No user configuration: system SMTP. In development an unconfigured system
  // SMTP falls back to Ethereal (test inbox); in production that would fake delivery.
  if (!system.configured && system.isProduction) {
    return {
      kind: 'unavailable',
      reason:
        'No SMTP server is configured. Add your SMTP settings in Settings → SMTP Config (or ask an administrator to set SMTP_HOST).',
    };
  }
  return { kind: 'system' };
}

/** True when two configs connect to the same server with the same credentials. */
export function isSameSmtpConnection(a: SmtpConfig, b: SmtpConfig): boolean {
  return (
    a.smtpHost.trim().toLowerCase() === b.smtpHost.trim().toLowerCase() &&
    a.smtpPort === b.smtpPort &&
    a.smtpUser.trim() === b.smtpUser.trim() &&
    a.smtpPass === b.smtpPass
  );
}
