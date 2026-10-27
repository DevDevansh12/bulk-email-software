import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { boundedRate, createSseParser, summarizeWhatsAppCampaigns, type WhatsAppCampaignSummary } from '@saas/shared';

import { computeAnalyticsOverview, lastUtcDays, type AnalyticsCampaignRow } from './analytics.metrics.js';

describe('boundedRate', () => {
  it('returns null for an empty denominator and rounds to one decimal', () => {
    assert.equal(boundedRate(1, 0), null);
    assert.equal(boundedRate(1, 3), 33.3);
    assert.equal(boundedRate(5, 2), 100, 'clamped as a guard');
  });
});

describe('computeAnalyticsOverview', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const campaign = (over: Partial<AnalyticsCampaignRow>): AnalyticsCampaignRow => ({
    id: 'c1',
    subject: 'Hello',
    sent_count: 2,
    failed_count: 1,
    total_opens: 9, // one recipient reloaded the pixel many times
    total_clicks: 0,
    created_at: '2026-10-19T08:00:00Z',
    started_at: '2026-10-19T09:00:00Z',
    campaign_recipients: [
      { open_count: 8, click_count: 1, opened_at: '2026-10-19T10:00:00Z', clicked_at: '2026-10-19T10:01:00Z' },
      { open_count: 1, click_count: 0, opened_at: '2026-10-19T11:00:00Z', clicked_at: null },
      { open_count: 0, click_count: 0, opened_at: null, clicked_at: null },
    ],
    ...over,
  });

  it('uses unique recipients so rates never exceed 100%', () => {
    const o = computeAnalyticsOverview([campaign({})], now);
    assert.equal(o.totalOpens, 9);
    assert.equal(o.uniqueOpens, 2);
    assert.equal(o.openRate, 100); // 2 unique / 2 sent
    assert.equal(o.uniqueClicks, 1);
    assert.equal(o.clickRate, 50);
    assert.equal(o.ctor, 50);
    assert.equal(o.failureRate, 33.3); // 1 / (2 + 1)
  });

  it('reports null rates when nothing was sent', () => {
    const o = computeAnalyticsOverview([campaign({ sent_count: 0, failed_count: 0, campaign_recipients: [] })], now);
    assert.equal(o.openRate, null);
    assert.equal(o.clickRate, null);
    assert.equal(o.ctor, null);
    assert.equal(o.topCampaigns.length, 0);
  });

  it('zero-fills a 14-day UTC timeline and buckets by start date', () => {
    const o = computeAnalyticsOverview([campaign({})], now);
    assert.equal(o.recentActivity.length, 14);
    assert.equal(o.recentActivity.at(-1)!.date, '2026-10-20');
    const day = o.recentActivity.find((d) => d.date === '2026-10-19')!;
    assert.equal(day.sent, 2);
    assert.equal(o.recentActivity.filter((d) => d.sent > 0).length, 1);
    assert.deepEqual(lastUtcDays(2, now), ['2026-10-19', '2026-10-20']);
  });
});

describe('summarizeWhatsAppCampaigns', () => {
  const wa = (over: Partial<WhatsAppCampaignSummary>): WhatsAppCampaignSummary => ({
    id: 'w',
    title: 't',
    status: 'completed',
    isSimulation: false,
    totalRecipients: 10,
    sentCount: 10,
    deliveredCount: 8,
    readCount: 4,
    failedCount: 0,
    createdAt: '2026-10-01T00:00:00Z',
    ...over,
  });

  it('excludes simulations from every real metric', () => {
    const t = summarizeWhatsAppCampaigns([wa({}), wa({ isSimulation: true, sentCount: 999, deliveredCount: 999 })]);
    assert.equal(t.campaigns, 1);
    assert.equal(t.simulatedCampaigns, 1);
    assert.equal(t.sent, 10);
    assert.equal(t.delivered, 8);
  });

  it('uses explicit denominators: delivered/sent and read/delivered', () => {
    const t = summarizeWhatsAppCampaigns([wa({})]);
    assert.equal(t.deliveryRate, 80);
    assert.equal(t.readRate, 50);
    assert.equal(summarizeWhatsAppCampaigns([]).readRate, null);
  });
});

describe('createSseParser', () => {
  it('handles events split across chunks and several events per chunk', () => {
    const p = createSseParser();
    assert.deepEqual(p.push('event: start\ndata: {"a"'), []);
    assert.deepEqual(p.push(':1}\n\nevent: progress\ndata: {"n":1}\n\nevent: progress\nda'), [
      { event: 'start', data: '{"a":1}' },
      { event: 'progress', data: '{"n":1}' },
    ]);
    assert.deepEqual(p.push('ta: {"n":2}\n\n'), [{ event: 'progress', data: '{"n":2}' }]);
  });

  it('ignores heartbeat comments, supports CRLF, and drops unterminated events', () => {
    const p = createSseParser();
    assert.deepEqual(p.push(': ping\n\nevent: complete\r\ndata: {}\r\n\r\n'), [{ event: 'complete', data: '{}' }]);
    assert.deepEqual(p.push('event: complete\ndata: {"partial":true}'), []);
    assert.deepEqual(p.flush(), [], 'a stream cut mid-event must not look like completion');
  });

  it('defaults the event name to "message"', () => {
    assert.deepEqual(createSseParser().push('data: x\n\n'), [{ event: 'message', data: 'x' }]);
  });
});
