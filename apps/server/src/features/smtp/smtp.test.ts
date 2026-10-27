import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { classifySmtpError, isSafeToRetrySmtpError, tlsOptionsForPort } from './smtp-errors.js';
import { isSameSmtpConnection, selectSmtpProvider, type SmtpConfig } from './smtp-provider.js';
import type * as SmtpServiceModule from './smtp.service.js';

const config: SmtpConfig = {
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  smtpUser: 'user@example.com',
  smtpPass: 'secret-pass',
  fromEmail: 'user@example.com',
  fromName: 'Example',
};

describe('selectSmtpProvider', () => {
  it('uses the user SMTP when settings were loaded', () => {
    const s = selectSmtpProvider({ status: 'found', config }, { configured: true, isProduction: true });
    assert.deepEqual(s, { kind: 'user', config });
  });

  it('uses system SMTP only when the user has no settings', () => {
    const s = selectSmtpProvider({ status: 'not_found' }, { configured: true, isProduction: true });
    assert.equal(s.kind, 'system');
  });

  it('never falls back to system SMTP when the lookup failed', () => {
    const s = selectSmtpProvider({ status: 'error', error: new Error('db down') }, { configured: true, isProduction: true });
    assert.equal(s.kind, 'unavailable');
  });

  it('refuses the fake Ethereal fallback in production', () => {
    const prod = selectSmtpProvider({ status: 'not_found' }, { configured: false, isProduction: true });
    assert.equal(prod.kind, 'unavailable');
    const dev = selectSmtpProvider({ status: 'not_found' }, { configured: false, isProduction: false });
    assert.equal(dev.kind, 'system');
  });
});

describe('isSameSmtpConnection', () => {
  it('ignores host case and from-address changes but not credential changes', () => {
    assert.equal(isSameSmtpConnection(config, { ...config, smtpHost: 'SMTP.example.com', fromName: 'Other' }), true);
    assert.equal(isSameSmtpConnection(config, { ...config, smtpPass: 'different' }), false);
    assert.equal(isSameSmtpConnection(config, { ...config, smtpPort: 465 }), false);
  });
});

describe('isSafeToRetrySmtpError', () => {
  it('retries connection failures before the message was transmitted', () => {
    assert.equal(isSafeToRetrySmtpError({ code: 'ECONNECTION', command: 'CONN' }), true);
    assert.equal(isSafeToRetrySmtpError({ code: 'ETIMEDOUT', command: 'CONN' }), true);
    assert.equal(isSafeToRetrySmtpError({ code: 'EENVELOPE', command: 'RCPT TO', responseCode: 451 }), false);
    assert.equal(isSafeToRetrySmtpError({ command: 'RCPT TO', responseCode: 451 }), true); // greylisting
  });

  it('never retries once DATA may have been accepted (duplicate risk)', () => {
    assert.equal(isSafeToRetrySmtpError({ code: 'ETIMEDOUT', command: 'DATA' }), false);
    assert.equal(isSafeToRetrySmtpError({ code: 'ESOCKET' }), false); // unknown stage
  });

  it('does not retry permanent or credential errors', () => {
    assert.equal(isSafeToRetrySmtpError({ code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 }), false);
    assert.equal(isSafeToRetrySmtpError({ command: 'RCPT TO', responseCode: 550 }), false);
  });
});

describe('classifySmtpError', () => {
  it('explains authentication failures without echoing secrets', () => {
    const info = classifySmtpError({ code: 'EAUTH', responseCode: 535, response: '535-5.7.8 Username and Password not accepted' });
    assert.equal(info.category, 'auth');
    assert.match(info.message, /app password/i);
    assert.doesNotMatch(info.message, /secret-pass/);
  });

  it('points at port/TLS mismatches', () => {
    const info = classifySmtpError({ code: 'ESOCKET', message: 'ssl3_get_record:wrong version number' });
    assert.equal(info.category, 'tls');
    assert.match(info.message, /465/);
  });

  it('identifies sender rejections', () => {
    const info = classifySmtpError({ command: 'MAIL FROM', responseCode: 553, response: '553 Sender address rejected: not owned by user' });
    assert.equal(info.category, 'sender_rejected');
  });
});

describe('tlsOptionsForPort', () => {
  it('uses implicit TLS on 465 and requires STARTTLS on 587', () => {
    assert.equal(tlsOptionsForPort('h', 465).secure, true);
    assert.equal(tlsOptionsForPort('h', 587).secure, false);
    assert.equal(tlsOptionsForPort('h', 587).requireTLS, true);
    assert.equal(tlsOptionsForPort('h', 25).requireTLS, false);
  });
});

describe('sendMailWithRetry', () => {
  let sendMailWithRetry: typeof SmtpServiceModule.sendMailWithRetry;

  before(async () => {
    // smtp.service imports the env/Supabase config; give it inert values (no network is used)
    process.env['SUPABASE_URL'] ??= 'http://127.0.0.1:54321';
    process.env['SUPABASE_ANON_KEY'] ??= 'test';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'test';
    process.env['SUPABASE_JWT_SECRET'] ??= 'test';
    process.env['NODE_ENV'] = 'test';
    ({ sendMailWithRetry } = await import('./smtp.service.js'));
  });

  const fakeTransport = (errors: unknown[]) => {
    let calls = 0;
    return {
      get calls() {
        return calls;
      },
      sendMail: async () => {
        const err = errors[calls++];
        if (err) throw err;
        return { messageId: '<ok@test>' };
      },
    };
  };
  const noSleep = async () => undefined;

  it('retries a pre-acceptance failure and succeeds', async () => {
    const t = fakeTransport([Object.assign(new Error('conn'), { code: 'ECONNECTION', command: 'CONN' })]);
    const res = await sendMailWithRetry(t as never, {}, noSleep);
    assert.equal(res.attempts, 2);
    assert.equal(t.calls, 2);
  });

  it('does not resend after a DATA-stage timeout', async () => {
    const t = fakeTransport([Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', command: 'DATA' })]);
    await assert.rejects(sendMailWithRetry(t as never, {}, noSleep), /timeout/);
    assert.equal(t.calls, 1);
  });

  it('gives up after a bounded number of attempts', async () => {
    const e = () => Object.assign(new Error('conn'), { code: 'ECONNECTION', command: 'CONN' });
    const t = fakeTransport([e(), e(), e(), e()]);
    await assert.rejects(sendMailWithRetry(t as never, {}, noSleep));
    assert.equal(t.calls, 3);
  });
});
