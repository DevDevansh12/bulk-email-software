import { summarizeWhatsAppCampaigns } from '@saas/shared';
import type { WhatsAppCampaignSummary } from '@saas/shared';
import { MessageSquare, Plus, FileText, Loader2, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { fetchWhatsAppCampaigns } from '@/lib/whatsapp-api';

function formatRate(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}%`;
}

export function WhatsAppCampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<WhatsAppCampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetchWhatsAppCampaigns()
      .then(setCampaigns)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load WhatsApp campaigns.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = summarizeWhatsAppCampaigns(campaigns);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Meta WhatsApp Cloud API</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">WhatsApp Campaigns</h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Send Meta-approved templates and track acceptance, delivery and read receipts reported by Meta's webhook.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/dashboard/whatsapp/templates">
              <Button size="lg" variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl flex items-center gap-2">
                <FileText className="h-4 w-4" aria-hidden="true" /> Templates
              </Button>
            </Link>
            <Link to="/dashboard/whatsapp/send">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" /> New WhatsApp Campaign
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry</Button>
          </div>
        </Alert>
      )}

      {/* Metrics (simulations excluded) */}
      {!error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Campaigns', value: totals.campaigns.toLocaleString(), hint: totals.simulatedCampaigns ? `+${totals.simulatedCampaigns} simulation(s), not counted` : 'Real sends only' },
            { label: 'Accepted by Meta', value: totals.sent.toLocaleString(), hint: 'Meta returned a message id' },
            { label: 'Delivered', value: totals.delivered.toLocaleString(), hint: `${formatRate(totals.deliveryRate)} of accepted (webhook)` },
            { label: 'Read', value: totals.read.toLocaleString(), hint: `${formatRate(totals.readRate)} of delivered · only if the recipient has read receipts on` },
          ].map((m) => (
            <StatCard key={m.label} label={m.label} value={m.value} hint={m.hint} loading={loading} />
          ))}
        </div>
      )}

      <Card className="card-modern overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <CardTitle className="text-base font-bold text-slate-900">Campaign history</CardTitle>
        </CardHeader>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-2" aria-hidden="true" />
            Loading WhatsApp campaigns...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-16 text-center space-y-4">
            <h3 className="text-lg font-bold text-slate-900">{error ? 'Campaigns could not be loaded' : 'No WhatsApp campaigns yet'}</h3>
            {!error && (
              <Link to="/dashboard/whatsapp/send">
                <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">Send your first WhatsApp campaign</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/30 text-xs font-semibold text-slate-500">
                  <th scope="col" className="px-6 py-3">Campaign</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Recipients</th>
                  <th scope="col" className="px-4 py-3">Accepted</th>
                  <th scope="col" className="px-4 py-3">Delivered</th>
                  <th scope="col" className="px-4 py-3">Read</th>
                  <th scope="col" className="px-4 py-3">Failed</th>
                  <th scope="col" className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => navigate(`/dashboard/whatsapp/campaigns/${c.id}`)}
                  >
                    <td className="px-6 py-3 font-bold text-slate-900">
                      <Link to={`/dashboard/whatsapp/campaigns/${c.id}`} className="hover:text-emerald-700" onClick={(e) => e.stopPropagation()}>
                        {c.title}
                      </Link>
                      {c.errorMessage && !c.isSimulation && (
                        <p className="text-[11px] font-normal text-rose-600 truncate max-w-xs" title={c.errorMessage}>{c.errorMessage}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} isSimulation={c.isSimulation} hasFailures={c.failedCount > 0} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.totalRecipients}</td>
                    <td className="px-4 py-3 text-slate-600">{c.isSimulation ? '—' : c.sentCount}</td>
                    <td className="px-4 py-3 text-slate-600">{c.isSimulation ? '—' : c.deliveredCount}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.isSimulation ? '—' : <>{c.readCount} <span className="text-xs text-slate-400">({formatRate(c.readRate)})</span></>}
                    </td>
                    <td className={`px-4 py-3 ${c.failedCount > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{c.failedCount}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
