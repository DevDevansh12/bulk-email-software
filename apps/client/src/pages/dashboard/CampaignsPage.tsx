import type { CampaignSummary } from '@saas/shared';
import { Plus, Search, Clock, MailOpen } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { fetchCampaigns } from '@/lib/campaigns-api';


const filters: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Sending', value: 'sending' },
  { label: 'Completed', value: 'completed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Failed', value: 'failed' },
];

export function CampaignsPage() {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const loadCampaigns = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchCampaigns(page, 10);
        setCampaigns(data.campaigns);
        setTotalPages(Math.ceil(data.total / 10));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load campaigns.');
      } finally {
        setLoading(false);
      }
    };
    void loadCampaigns();
  }, [page, reloadKey]);

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesFilter = activeFilter === 'all' || c.status === activeFilter;
    const matchesSearch = c.subject.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">Create and manage your email campaigns.</p>
        </div>
        <Link to="/dashboard/campaigns/send">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </Link>
      </div>

      {error && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center gap-3">
            <span>Campaigns could not be loaded: {error}</span>
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>
          </div>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter tabs */}
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 gap-0.5 overflow-x-auto scrollbar-hide">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={activeFilter === f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeFilter === f.value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search + filter */}
        <div className="flex gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search campaigns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                    <th className="px-6 py-3 font-medium text-slate-500">Subject</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Recipients</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Sent</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Failed</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-6 py-4"><div className="h-4 w-48 skeleton" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-20 skeleton" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-12 skeleton" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-12 skeleton" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-12 skeleton" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-24 skeleton" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="bg-indigo-50 p-4 rounded-full mb-4">
                <MailOpen className="h-10 w-10 text-indigo-400" />
              </div>
              <p className="font-medium text-slate-900 text-lg">{error ? 'Campaigns not available' : 'No campaigns found'}</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                {error ? 'Use Retry above once the connection is back.' : search || activeFilter !== 'all' 
                  ? 'Try adjusting your filters or search term to find what you\'re looking for.' 
                  : 'Create your first email campaign to engage with your audience.'}
              </p>
              {(!error && !search && activeFilter === 'all') && (
                <Link to="/dashboard/campaigns/send" className="mt-6">
                  <Button>Create Campaign</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                    <th className="px-6 py-3 font-medium text-slate-500">Subject</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Recipients</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Sent</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Failed</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/dashboard/campaigns/${c.id}`)}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">{c.subject}</p>
                        {c.status === 'scheduled' && c.scheduledAt && (
                          <p className="flex items-center gap-1 text-xs text-violet-600 mt-0.5 font-medium">
                            <Clock className="w-3 h-3" />
                            Sends {new Date(c.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={c.status} hasFailures={c.failedCount > 0} />
                      </td>
                      <td className="px-4 py-4 text-slate-600 font-medium">
                        {c.totalRecipients > 0 ? c.totalRecipients.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {c.sentCount > 0 ? c.sentCount.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {c.failedCount > 0 ? c.failedCount.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {c.status === 'scheduled' && c.scheduledAt
                          ? <span className="text-violet-600 font-medium">{new Date(c.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          : new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
