import { boundedRate } from '@saas/shared';
import type { WhatsAppCampaignDetail, WhatsAppRecipientStatus } from '@saas/shared';
import { ArrowLeft, Download, FlaskConical, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FilterTabs } from '@/components/ui/FilterTabs';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { fetchWhatsAppCampaign } from '@/lib/whatsapp-api';


const recipientLabel: Record<WhatsAppRecipientStatus, string> = {
  pending: 'Pending',
  sent: 'Accepted by Meta',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
  simulated: 'Simulated (not sent)',
};

type Filter = 'all' | WhatsAppRecipientStatus;

function formatRate(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

export function WhatsAppCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<WhatsAppCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError('');
      setCampaign(await fetchWhatsAppCampaign(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while sending, and for a few minutes afterwards while webhook receipts arrive
  const recentlyCompleted =
    campaign?.completedAt && Date.now() - new Date(campaign.completedAt).getTime() < 10 * 60 * 1000;
  const shouldPoll = !!campaign && !campaign.isSimulation && (campaign.status === 'sending' || campaign.status === 'pending' || recentlyCompleted);
  useEffect(() => {
    if (!shouldPoll || !id) return;
    const t = setInterval(() => {
      fetchWhatsAppCampaign(id)
        .then((data) => {
          setCampaign(data);
          setPollError('');
        })
        .catch((err: unknown) => setPollError(err instanceof Error ? err.message : 'Connection problem'));
    }, 5000);
    return () => clearInterval(t);
  }, [shouldPoll, id]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of campaign?.recipients ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [campaign]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (campaign?.recipients ?? []).filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!q || r.phone.includes(q.replace(/\D/g, '') || q) || (r.name ?? '').toLowerCase().includes(q) || (r.error ?? '').toLowerCase().includes(q))
    );
  }, [campaign, filter, query]);

  const exportFailed = () => {
    const failed = (campaign?.recipients ?? []).filter((r) => r.status === 'failed');
    if (failed.length === 0) return;
    const esc = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const csv = 'phone,name,error_code,error\n' + failed.map((r) => [esc(`+${r.phone}`), esc(r.name), esc(r.errorCode), esc(r.error)].join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `failed-whatsapp-${campaign?.title.slice(0, 20) || 'campaign'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="p-6"><div className="h-8 w-64 skeleton mb-4" /><div className="h-64 skeleton" /></div>;
  }

  if (error || !campaign) {
    return (
      <div className="p-6 space-y-3">
        <Link to="/dashboard/whatsapp" className="inline-flex items-center text-sm text-slate-500 hover:text-emerald-700">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to WhatsApp campaigns
        </Link>
        <Alert variant="error">{error || 'Campaign not found'}</Alert>
        {error && <Button variant="secondary" onClick={() => void load()}>Retry</Button>}
      </div>
    );
  }

  const deliveryRate = boundedRate(campaign.deliveredCount, campaign.sentCount);

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in">
      <div>
        <Link to="/dashboard/whatsapp" className="inline-flex items-center text-sm text-slate-500 hover:text-emerald-700 mb-3">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to WhatsApp campaigns
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{campaign.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              <StatusBadge status={campaign.status} isSimulation={campaign.isSimulation} hasFailures={campaign.failedCount > 0} className="mr-2" />
              Created {new Date(campaign.createdAt).toLocaleString()}
              {campaign.messageMode && ` · ${campaign.messageMode === 'template' ? 'Template message' : 'Free-form text'}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
            {campaign.failedCount > 0 && (
              <Button variant="secondary" size="sm" onClick={exportFailed}><Download className="h-3.5 w-3.5 mr-1.5" /> Export failed</Button>
            )}
          </div>
        </div>
      </div>

      {campaign.isSimulation && (
        <Alert variant="warning">
          <span className="inline-flex items-center gap-1.5 font-semibold"><FlaskConical className="h-4 w-4" /> Simulation</span>
          <span className="block text-sm">This campaign was a development simulation. No WhatsApp messages were sent.</span>
        </Alert>
      )}
      {campaign.errorMessage && !campaign.isSimulation && <Alert variant={campaign.status === 'failed' ? 'error' : 'warning'}>{campaign.errorMessage}</Alert>}
      {pollError && <p className="text-xs text-amber-700">Live updates paused ({pollError}); retrying.</p>}

      {!campaign.isSimulation && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Recipients', value: campaign.totalRecipients, hint: `${counts['pending'] ?? 0} pending` },
            { label: 'Accepted by Meta', value: campaign.sentCount, hint: 'Has a message id' },
            { label: 'Delivered', value: campaign.deliveredCount, hint: `${formatRate(deliveryRate)} of accepted` },
            { label: 'Read', value: campaign.readCount, hint: `${formatRate(campaign.readRate ?? null)} of delivered` },
            { label: 'Failed', value: campaign.failedCount, hint: 'Rejected or reported failed' },
          ].map((m) => (
            <StatCard
              key={m.label}
              label={m.label}
              value={m.value.toLocaleString()}
              hint={m.hint}
              highlight={m.label === 'Failed' && m.value > 0}
            />
          ))}
        </div>
      )}
      {!campaign.isSimulation && campaign.sentCount > 0 && campaign.deliveredCount === 0 && campaign.status === 'completed' && (
        <p className="text-xs text-slate-500">
          No delivery receipts received yet. They come from the Meta webhook — check that it is configured (WhatsApp setup guide).
        </p>
      )}

      <Card>
        <CardHeader className="border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base">Recipients</CardTitle>
          <FilterTabs
            ariaLabel="Filter recipients by status"
            value={filter}
            onChange={setFilter}
            options={(['all', 'pending', 'sent', 'delivered', 'read', 'failed', 'simulated'] as const)
              .filter((f) => f === 'all' || (counts[f] ?? 0) > 0)
              .map((f) => ({
                value: f,
                label: f === 'all' ? 'All' : recipientLabel[f],
                count: f === 'all' ? campaign.recipients.length : counts[f] ?? 0,
                ...(f === 'failed' && { tone: 'danger' as const }),
              }))}
          />
        </CardHeader>
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search recipients"
              placeholder="Search by phone, name, or error…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full rounded border border-slate-200 bg-white pl-9 pr-3 text-xs"
            />
          </div>
        </div>
        <CardContent className="p-0 overflow-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-slate-100">
              <tr className="text-left text-slate-500 text-xs uppercase">
                <th scope="col" className="px-6 py-3">Phone</th>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className={r.status === 'failed' ? 'bg-rose-50/30' : ''}>
                  <td className="px-6 py-2.5 font-mono text-slate-900">+{r.phone}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.name || '—'}</td>
                  <td className="px-4 py-2.5"><StatusBadge kind="whatsapp-recipient" status={r.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {r.status === 'failed' ? (
                      <span className="text-rose-700 break-words">{r.errorCode && <span className="font-mono">[{r.errorCode}] </span>}{r.error}</span>
                    ) : r.readAt ? (
                      `Read ${new Date(r.readAt).toLocaleString()}`
                    ) : r.deliveredAt ? (
                      `Delivered ${new Date(r.deliveredAt).toLocaleString()}`
                    ) : r.sentAt ? (
                      `Accepted ${new Date(r.sentAt).toLocaleString()}`
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-400">No recipients match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
