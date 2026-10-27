import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import { normalizePhone } from '@saas/shared';

import {
  analyzeTemplateComponents,
  buildTemplateMessagePayload,
  describeMetaError,
  extractTemplateVariables,
  sendWhatsAppMessage,
  type FetchLike,
} from './whatsapp-meta.js';
import { buildWhatsAppRecipients } from './whatsapp-recipients.js';
import { computeStatusUpdate, verifyMetaSignature, type RecipientDeliveryState } from './whatsapp-webhook.logic.js';

const sheet = (headers: string[], rows: string[][]) => ({
  headers,
  rows: rows.map((r, i) => ({ rowNumber: i + 2, values: Object.fromEntries(headers.map((h, j) => [h, r[j] ?? ''])) })),
});

describe('normalizePhone', () => {
  it('normalizes international formats to E.164 digits', () => {
    assert.deepEqual(normalizePhone('+91 98765-43210'), { ok: true, digits: '919876543210' });
    assert.deepEqual(normalizePhone('0044 20 7946 0958'), { ok: true, digits: '442079460958' });
    assert.deepEqual(normalizePhone('919876543210'), { ok: true, digits: '919876543210' });
  });

  it('requires a country code for national numbers unless a default is given', () => {
    assert.equal(normalizePhone('09876543210').ok, false);
    assert.deepEqual(normalizePhone('09876543210', { defaultCountryCode: '91' }), { ok: true, digits: '919876543210' });
    assert.deepEqual(normalizePhone('(415) 555-0123', { defaultCountryCode: '1' }), { ok: true, digits: '14155550123' });
  });

  it('rejects garbage and Excel scientific notation', () => {
    assert.equal(normalizePhone('call me').ok, false);
    assert.match((normalizePhone('9.19877E+11') as { error: string }).error, /scientific notation/);
    assert.equal(normalizePhone('+1234').ok, false);
  });
});

describe('buildWhatsAppRecipients', () => {
  it('flags duplicates after normalization instead of overwriting', () => {
    const list = buildWhatsAppRecipients(
      sheet(['phone', 'name'], [['+91 98765 43210', 'A'], ['919876543210', 'B'], ['+14155550123', 'C']])
    );
    assert.equal(list.totalValid, 2);
    assert.equal(list.duplicateCount, 1);
    assert.equal(list.recipients[1]!.status, 'duplicate');
    assert.equal(list.recipients[1]!.duplicateOfRow, 2);
    assert.deepEqual(list.sendable.map((r) => r.name), ['A', 'C']);
  });

  it('validates template variable values per row', () => {
    const list = buildWhatsAppRecipients(
      sheet(['phone', 'first', 'code'], [['+14155550123', 'Ann', 'X1'], ['+14155550124', '', 'X2'], ['+14155550125', 'Bo\nb', 'X3']]),
      { variables: ['1', '2'], variableColumns: { '1': 'first', '2': 'code' } }
    );
    assert.equal(list.totalValid, 1);
    assert.deepEqual(list.sendable[0]!.variableValues, ['Ann', 'X1']);
    assert.match(list.recipients[1]!.error ?? '', /Missing value for \{\{1\}\}/);
    assert.match(list.recipients[2]!.error ?? '', /new lines/);
  });
});

describe('Meta template payloads', () => {
  it('orders positional variables numerically', () => {
    assert.deepEqual(extractTemplateVariables('Hi {{2}} and {{1}} and {{10}}'), { variables: ['1', '2', '10'], format: 'POSITIONAL' });
  });

  it('builds a positional template payload with language and body parameters', () => {
    const payload = buildTemplateMessagePayload(
      '919876543210',
      { name: 'order_update', language: 'en_US', variables: ['1', '2'], parameterFormat: 'POSITIONAL' },
      ['Ann', '#123']
    );
    assert.deepEqual(payload, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'order_update',
        language: { code: 'en_US' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ann' }, { type: 'text', text: '#123' }] }],
      },
    });
  });

  it('includes parameter_name for named templates and omits components without variables', () => {
    const named = buildTemplateMessagePayload('1', { name: 't', language: 'en', variables: ['first_name'], parameterFormat: 'NAMED' }, ['Ann']);
    assert.deepEqual(named.template.components?.[0]?.parameters[0], { type: 'text', text: 'Ann', parameter_name: 'first_name' });
    const none = buildTemplateMessagePayload('1', { name: 'hello_world', language: 'en_US', variables: [], parameterFormat: 'POSITIONAL' }, []);
    assert.equal('components' in none.template, false);
  });

  it('refuses a parameter count mismatch', () => {
    assert.throws(() => buildTemplateMessagePayload('1', { name: 't', language: 'en', variables: ['1'], parameterFormat: 'POSITIONAL' }, []));
  });

  it('flags templates needing media or dynamic buttons', () => {
    const media = analyzeTemplateComponents([{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hi {{1}}' }]);
    assert.match(media.unsupportedReason!, /image header/);
    const ok = analyzeTemplateComponents([{ type: 'HEADER', format: 'TEXT', text: 'Sale' }, { type: 'BODY', text: 'Hi {{1}}' }]);
    assert.equal(ok.unsupportedReason, undefined);
    assert.deepEqual(ok.variables, ['1']);
  });
});

describe('Meta errors and sending', () => {
  it('explains the 24-hour window rejection', () => {
    const info = describeMetaError({ code: 131047, message: 'Re-engagement message' });
    assert.match(info.message, /24 hours/);
    assert.equal(info.retryable, false);
    assert.equal(describeMetaError({ code: 130429 }).retryable, true);
  });

  it('sends the template with the bearer token in the header only', async () => {
    const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.ABC' }] }) };
    };
    const result = await sendWhatsAppMessage(
      { phoneNumberId: '1234567890', accessToken: 'TOKEN-SECRET' },
      { type: 'template' },
      { apiVersion: 'v23.0', fetchImpl }
    );
    assert.deepEqual(result, { ok: true, wamid: 'wamid.ABC' });
    assert.equal(calls[0]!.url, 'https://graph.facebook.com/v23.0/1234567890/messages');
    assert.equal(calls[0]!.init.headers['Authorization'], 'Bearer TOKEN-SECRET');
    assert.doesNotMatch(calls[0]!.url, /TOKEN-SECRET/);
  });

  it('retries only when Meta reports a rate limit', async () => {
    let n = 0;
    const fetchImpl: FetchLike = async () => {
      n++;
      return n === 1
        ? { ok: false, status: 429, json: async () => ({ error: { code: 130429, message: 'Rate limit hit' } }) }
        : { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.2' }] }) };
    };
    const result = await sendWhatsAppMessage({ phoneNumberId: '1', accessToken: 't' }, {}, { apiVersion: 'v23.0', fetchImpl, sleep: async () => undefined });
    assert.equal(result.ok, true);
    assert.equal(n, 2);
  });

  it('does not retry a network error (the message may have been accepted)', async () => {
    let n = 0;
    const fetchImpl: FetchLike = async () => {
      n++;
      throw new Error('socket hang up');
    };
    const result = await sendWhatsAppMessage({ phoneNumberId: '1', accessToken: 'SECRET' }, {}, { apiVersion: 'v23.0', fetchImpl, sleep: async () => undefined });
    assert.equal(result.ok, false);
    assert.equal(n, 1);
    if (!result.ok) {
      assert.match(result.error.message, /status unknown/);
      assert.doesNotMatch(result.error.message, /SECRET/);
    }
  });

  it('treats a 200 without a message id as a failure, not a success', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({}) });
    const result = await sendWhatsAppMessage({ phoneNumberId: '1', accessToken: 't' }, {}, { apiVersion: 'v23.0', fetchImpl });
    assert.equal(result.ok, false);
  });
});

describe('webhook signature', () => {
  const secret = 'app-secret';
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const sign = (b: Buffer) => `sha256=${createHmac('sha256', secret).update(b).digest('hex')}`;

  it('accepts a correct signature and rejects tampering or missing headers', () => {
    assert.equal(verifyMetaSignature(body, sign(body), secret), true);
    assert.equal(verifyMetaSignature(Buffer.from('{"object":"x"}'), sign(body), secret), false);
    assert.equal(verifyMetaSignature(body, undefined, secret), false);
    assert.equal(verifyMetaSignature(body, 'sha1=abc', secret), false);
    assert.equal(verifyMetaSignature(body, sign(body), 'wrong-secret'), false);
  });
});

describe('webhook status transitions (idempotency)', () => {
  const base: RecipientDeliveryState = { status: 'sent', delivered_at: null, read_at: null, error: null };
  const ev = (status: string, ts = '1700000000') => ({ id: 'wamid.1', status, timestamp: ts });

  /** Apply events like the DB would and count how many changed the row. */
  function replay(events: ReturnType<typeof ev>[], start = base) {
    let state = { ...start };
    let changes = 0;
    for (const e of events) {
      const update = computeStatusUpdate(state, e);
      if (update) {
        changes++;
        state = { ...state, ...update };
      }
    }
    return { state, changes };
  }

  it('ignores duplicate callbacks', () => {
    const { state, changes } = replay([ev('delivered'), ev('delivered'), ev('delivered')]);
    assert.equal(state.status, 'delivered');
    assert.equal(changes, 1);
  });

  it('never regresses read back to delivered, but backfills delivered_at once', () => {
    const { state, changes } = replay([ev('read', '1700000100'), ev('delivered', '1700000050'), ev('delivered', '1700000050')]);
    assert.equal(state.status, 'read');
    assert.equal(state.read_at, new Date(1700000100 * 1000).toISOString());
    assert.ok(state.delivered_at);
    assert.equal(changes, 1, 'read already implies delivered_at; late delivered events are no-ops');
  });

  it('records failures with provider details and ignores failures after delivery', () => {
    const failed = computeStatusUpdate(base, {
      id: 'w',
      status: 'failed',
      errors: [{ code: 131026, title: 'Message undeliverable', error_data: { details: 'Receiver incapable' } }],
    });
    assert.deepEqual(failed, { status: 'failed', error: 'Message undeliverable: Receiver incapable', error_code: '131026' });
    assert.equal(computeStatusUpdate({ ...base, status: 'delivered' }, ev('failed')), null);
  });

  it('never touches simulated rows or unknown statuses', () => {
    assert.equal(computeStatusUpdate({ ...base, status: 'simulated' }, ev('delivered')), null);
    assert.equal(computeStatusUpdate(base, ev('deleted')), null);
  });
});
