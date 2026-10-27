import type { AnalyticsOverview } from '@saas/shared';
import { Mail, TrendingUp, MousePointerClick, AlertCircle, Eye, XCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { fetchAnalyticsOverview } from '@/lib/analytics-api';


function formatRate(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function formatDay(isoDate: string): string {
  // isoDate is a UTC calendar day (YYYY-MM-DD); format it without shifting time zones
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setData(await fetchAnalyticsOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const metrics = [
    {
      label: 'Sent (accepted by SMTP)',
      value: data ? data.totalSent.toLocaleString() : '—',
      hint: 'Messages the mail server accepted. Inbox delivery is not confirmed.',
      icon: Mail,
      tone: 'indigo' as const,
    },
    {
      label: 'Failed',
      value: data ? data.totalFailed.toLocaleString() : '—',
      hint: `Failure rate ${formatRate(data?.failureRate)} of attempted (sent + failed).`,
      icon: XCircle,
      tone: 'rose' as const,
    },
    {
      label: 'Unique opens (est.)',
      value: data ? data.uniqueOpens.toLocaleString() : '—',
      hint: `Open rate ${formatRate(data?.openRate)} of sent · ${data?.totalOpens.toLocaleString() ?? '—'} total pixel loads.`,
      icon: Eye,
      tone: 'emerald' as const,
    },
    {
      label: 'Unique clicks',
      value: data ? data.uniqueClicks.toLocaleString() : '—',
      hint: `Click rate ${formatRate(data?.clickRate)} of sent · ${data?.totalClicks.toLocaleString() ?? '—'} total clicks.`,
      icon: MousePointerClick,
      tone: 'indigo' as const,
    },
    {
      label: 'Click-to-open (CTOR)',
      value: formatRate(data?.ctor),
      hint: 'Unique clicks ÷ unique opens.',
      icon: TrendingUp,
      tone: 'violet' as const,
    },
  ];

  const activity = data?.recentActivity ?? [];
  const hasActivity = activity.some((d) => d.sent > 0 || d.failed > 0);
  const maxActivity = Math.max(1, ...activity.map((d) => Math.max(d.sent, d.failed, d.uniqueOpens, d.uniqueClicks)));

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Email Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Email campaigns only. Opens are tracked with an image pixel, so they are estimates: image blocking hides some
            opens and privacy proxies (e.g. Apple Mail) can report opens that didn't happen.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void loadData()} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center gap-3">
            <span>Analytics could not be loaded: {error}</span>
            <Button variant="secondary" size="sm" onClick={() => void loadData()}>Retry</Button>
          </div>
        </Alert>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metrics.map((m) => (
          <StatCard
            key={m.label}
            label={m.label}
            value={m.value}
            hint={m.hint}
            icon={m.icon}
            tone={m.tone}
            loading={loading && !data}
            highlight={m.label === 'Failed' && (data?.totalFailed ?? 0) > 0}
          />
        ))}
      </div>

      {/* Daily activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last 14 days</CardTitle>
          <CardDescription>
            Per UTC day, grouped by when each campaign started sending. Opens/clicks are attributed to the campaign's start day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="h-48 skeleton" />
          ) : hasActivity ? (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-2 h-48 min-w-[560px]" role="img" aria-label="Daily email activity for the last 14 days">
                {activity.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full items-end gap-0.5 justify-center" style={{ height: '160px' }}>
                      {[
                        { v: d.sent, cls: 'bg-indigo-500', label: 'Sent' },
                        { v: d.failed, cls: 'bg-rose-400', label: 'Failed' },
                        { v: d.uniqueOpens, cls: 'bg-green-500', label: 'Unique opens' },
                        { v: d.uniqueClicks, cls: 'bg-blue-500', label: 'Unique clicks' },
                      ].map((bar) => (
                        <div
                          key={bar.label}
                          className={`flex-1 rounded-t ${bar.cls}`}
                          style={{ height: `${(bar.v / maxActivity) * 160}px` }}
                          title={`${formatDay(d.date)} · ${bar.label}: ${bar.v}`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">{formatDay(d.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">
              No email campaigns sent in the last 14 days.
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100">
            {[
              ['bg-indigo-500', 'Sent'],
              ['bg-rose-400', 'Failed'],
              ['bg-green-500', 'Unique opens'],
              ['bg-blue-500', 'Unique clicks'],
            ].map(([cls, label]) => (
              <span key={label} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={`h-2.5 w-2.5 rounded-sm ${cls}`} /> {label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Performing Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Campaigns by Open Rate</CardTitle>
          <CardDescription>Open rate = unique opens ÷ sent · Click rate = unique clicks ÷ sent</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                <th scope="col" className="px-6 py-3 font-medium text-slate-500">Campaign</th>
                <th scope="col" className="px-4 py-3 font-medium text-slate-500">Sent</th>
                <th scope="col" className="px-4 py-3 font-medium text-slate-500">Unique opens</th>
                <th scope="col" className="px-4 py-3 font-medium text-slate-500">Open rate</th>
                <th scope="col" className="px-4 py-3 font-medium text-slate-500">Click rate</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-6 py-4"><div className="h-4 w-32 skeleton" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-12 skeleton" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-12 skeleton" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-16 skeleton" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-16 skeleton" /></td>
                  </tr>
                ))
              ) : data?.topCampaigns && data.topCampaigns.length > 0 ? (
                data.topCampaigns.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                    <td className="px-6 py-3.5 font-medium text-slate-900">{row.subject}</td>
                    <td className="px-4 py-3.5 text-slate-600">{row.sentCount.toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-slate-600">{row.uniqueOpens.toLocaleString()}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${row.openRate ?? 0}%` }} />
                        </div>
                        <span className="font-medium text-slate-900">{formatRate(row.openRate)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{formatRate(row.clickRate)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    {error ? 'Not available.' : 'No sent campaigns yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {!loading && data && data.totalSent === 0 && !error && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <AlertCircle className="h-3.5 w-3.5" /> Rates show "—" until at least one email has been sent.
        </p>
      )}
    </div>
  );
}
