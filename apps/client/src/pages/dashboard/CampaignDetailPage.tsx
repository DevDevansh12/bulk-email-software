import type { CampaignDetail } from '@saas/shared';
import { ArrowLeft, Send, Users, Clock, AlertCircle, Copy, Download, Search, Check, XCircle, Eye } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FilterTabs } from '@/components/ui/FilterTabs';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { toast } from '@/components/ui/Toast';
import { apiClient } from '@/lib/api-client';
import { fetchCampaign } from '@/lib/campaigns-api';


export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Table filtering & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'opened' | 'failed'>('all');
  const [copiedFailed, setCopiedFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchCampaign(id);
        setCampaign(data);
      } catch (err) {
        setError(err instanceof Error ? `Failed to load campaign details: ${err.message}` : 'Failed to load campaign details.');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [id, reloadKey]);

  // Auto-refresh while campaign is in-progress (sending or scheduled)
  useEffect(() => {
    if (!id || !campaign) return;
    if (campaign.status !== 'sending' && campaign.status !== 'scheduled') return;

    const interval = setInterval(() => {
      fetchCampaign(id)
        .then((data) => {
          setCampaign(data);
          setPollError('');
          if (data.status !== 'sending' && data.status !== 'scheduled') {
            clearInterval(interval);
          }
        })
        .catch((err: unknown) => setPollError(err instanceof Error ? err.message : 'Connection problem'));
    }, 5000);

    return () => clearInterval(interval);
  }, [id, campaign?.status]);

  const failedRecipients = useMemo(() => {
    return campaign?.recipients.filter(r => r.status === 'failed') || [];
  }, [campaign?.recipients]);

  const openedRecipients = useMemo(() => {
    return campaign?.recipients.filter(r => (r.openCount && r.openCount > 0) || r.openedAt) || [];
  }, [campaign?.recipients]);

  const deliveredRecipients = useMemo(() => {
    return campaign?.recipients.filter(r => r.status === 'sent') || [];
  }, [campaign?.recipients]);

  const filteredRecipients = useMemo(() => {
    if (!campaign) return [];
    let list = campaign.recipients;

    if (statusFilter === 'failed') {
      list = list.filter(r => r.status === 'failed');
    } else if (statusFilter === 'opened') {
      list = list.filter(r => (r.openCount && r.openCount > 0) || r.openedAt);
    } else if (statusFilter === 'sent') {
      list = list.filter(r => r.status === 'sent');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => 
        r.email.toLowerCase().includes(q) || 
        (r.name?.toLowerCase().includes(q)) ||
        (r.error?.toLowerCase().includes(q))
      );
    }

    return list;
  }, [campaign, statusFilter, searchQuery]);

  const copyFailedEmails = () => {
    if (failedRecipients.length === 0) return;
    const emailsText = failedRecipients.map(r => r.email).join('\n');
    navigator.clipboard.writeText(emailsText);
    setCopiedFailed(true);
    toast.success(`Copied ${failedRecipients.length} failed email addresses to clipboard!`);
    setTimeout(() => setCopiedFailed(false), 2500);
  };

  const exportFailedCsv = () => {
    if (failedRecipients.length === 0) return;
    const headers = 'email,name,error,status\n';
    const rows = failedRecipients.map(r => 
      `"${r.email}","${(r.name || '').replace(/"/g, '""')}","${(r.error || 'Delivery failed').replace(/"/g, '""')}","failed"`
    ).join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `failed-recipients-${campaign?.subject.slice(0, 20) || 'campaign'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${failedRecipients.length} failed recipients CSV!`);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="h-8 w-64 skeleton mb-2" />
        <div className="h-4 w-32 skeleton mb-8" />
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><div className="h-16 skeleton" /></CardContent></Card>
          ))}
        </div>
        
        <Card><CardContent className="h-64 p-6"><div className="h-full skeleton" /></CardContent></Card>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="p-6 animate-fade-in">
        <Link to="/dashboard/campaigns">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Campaigns
          </Button>
        </Link>
        <Alert variant="error">{error || 'Campaign not found'}</Alert>
        {error && (
          <Button variant="secondary" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  const hasFailures = campaign.failedCount > 0 || failedRecipients.length > 0;
  const pendingCount = campaign.recipients.filter((r) => r.status === 'pending').length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Link to="/dashboard/campaigns" className="inline-flex items-center text-sm text-slate-500 hover:text-indigo-600 transition-colors mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Campaigns
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 break-words">{campaign.subject}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <StatusBadge status={campaign.status} hasFailures={campaign.failedCount > 0} />
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {new Date(campaign.createdAt).toLocaleString()}
              </span>
              <span>•</span>
              <span>From: <strong>{campaign.senderName}</strong></span>
            </div>
          </div>

          {/* Quick Actions */}
          {hasFailures && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={copyFailedEmails}
                className="text-xs font-semibold flex items-center gap-1.5 border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
              >
                {copiedFailed ? <Check className="h-3.5 w-3.5 text-rose-600" /> : <Copy className="h-3.5 w-3.5" />}
                Copy Failed Emails ({failedRecipients.length})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={exportFailedCsv}
                className="text-xs font-semibold flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Export Failed CSV
              </Button>
            </div>
          )}
        </div>
      </div>

      {campaign.errorMessage && (
        <Alert variant={campaign.status === 'failed' ? 'error' : 'warning'}>
          <div>
            <p className="font-semibold">{campaign.status === 'failed' ? 'Campaign failed' : 'Campaign finished with a problem'}</p>
            <p className="text-sm break-words">{campaign.errorMessage}</p>
          </div>
        </Alert>
      )}
      {(campaign.status === 'sending' || campaign.status === 'scheduled') && (
        <p className="text-xs text-slate-500" role="status">
          {campaign.status === 'scheduled'
            ? `Scheduled${campaign.scheduledAt ? ` for ${new Date(campaign.scheduledAt).toLocaleString()}` : ''} — this page refreshes automatically.`
            : `Sending… ${pendingCount} recipient(s) still pending. This page refreshes every 5 seconds.`}
          {pollError && <span className="text-amber-700"> Live updates paused ({pollError}); retrying.</span>}
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-50 p-3 rounded-lg text-amber-600">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Recipients</p>
              <p className="text-2xl font-bold text-slate-900">{campaign.totalRecipients.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
              <Send className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500" title="Accepted by the SMTP server. Inbox delivery is not confirmed.">Accepted by SMTP</p>
              <p className="text-2xl font-bold text-slate-900">{campaign.sentCount.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-50 p-3 rounded-lg text-green-600">
              <Eye className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500" title="Recipients who loaded the tracking image at least once. Image blocking and privacy proxies make this an estimate.">Unique Opens (est.)</p>
              <p className="text-2xl font-bold text-slate-900">
                {(campaign.uniqueOpens ?? 0).toLocaleString()}
                {campaign.openRate !== null && campaign.openRate !== undefined && (
                  <span className="ml-1.5 text-sm font-medium text-slate-500">{campaign.openRate}% of sent</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        
        <Card className={hasFailures ? 'border-rose-200 bg-rose-50/20' : ''}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className={hasFailures ? 'bg-rose-100 p-3 rounded-lg text-rose-600' : 'bg-slate-100 p-3 rounded-lg text-slate-500'}>
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Failed</p>
              <p className={`text-2xl font-bold ${hasFailures ? 'text-rose-600' : 'text-slate-900'}`}>
                {campaign.failedCount.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PROMINENT FAILED DELIVERIES SUMMARY SECTION (if any failed) */}
      {hasFailures && (
        <Card className="border-rose-200 bg-rose-50/30 shadow-sm animate-scale-in">
          <CardHeader className="bg-rose-50/70 border-b border-rose-200/80 px-6 py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-rose-100 text-rose-600">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-rose-900">
                  Failed Recipients ({failedRecipients.length})
                </CardTitle>
                <p className="text-xs text-rose-700 mt-0.5">
                  These addresses were rejected by the SMTP server or could not be attempted. The reason is shown for each one.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={copyFailedEmails}
                className="bg-white border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                {copiedFailed ? <Check className="h-3.5 w-3.5 text-rose-600" /> : <Copy className="h-3.5 w-3.5" />}
                Copy Failed Emails
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={exportFailedCsv}
                className="bg-white border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-[280px] overflow-y-auto">
            <div className="divide-y divide-rose-100">
              {failedRecipients.map((recipient) => (
                <div key={recipient.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-rose-50/50 transition-colors">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">{recipient.email}</span>
                      {recipient.name && (
                        <span className="text-xs text-slate-500 font-medium">({recipient.name})</span>
                      )}
                    </div>
                    <p className="text-xs text-rose-700 font-mono bg-rose-100/60 px-2 py-0.5 rounded inline-block">
                      {recipient.error || 'Send failed (no reason recorded)'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(recipient.email);
                      toast.success(`Copied "${recipient.email}"`);
                    }}
                    className="self-start sm:self-center text-xs font-semibold text-rose-700 hover:text-rose-900 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Copy className="h-3 w-3" />
                    Copy Email
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recipients Table */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Recipients List</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">All contact dispatch statuses for this campaign</p>
              </div>

              <FilterTabs
                ariaLabel="Filter recipients"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'All', count: campaign.recipients.length },
                  { value: 'sent', label: 'Sent', count: deliveredRecipients.length },
                  { value: 'opened', label: 'Opened', count: openedRecipients.length },
                  ...(failedRecipients.length > 0
                    ? [{ value: 'failed' as const, label: 'Failed', count: failedRecipients.length, tone: 'danger' as const }]
                    : []),
                ]}
              />
            </CardHeader>

            {/* Search within recipients */}
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search recipients"
                  placeholder="Search recipients by email, name, or error..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-full rounded border border-slate-200 bg-white pl-9 pr-3 text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <CardContent className="p-0 flex-1 overflow-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white/95 backdrop-blur z-10 border-b border-slate-100 shadow-xs">
                  <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                    <th scope="col" className="px-6 py-3 font-semibold">Email</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecipients.map((recipient) => {
                    const isOpened = (recipient.openCount && recipient.openCount > 0) || recipient.openedAt;
                    return (
                      <tr key={recipient.id} className={`hover:bg-slate-50 transition-colors ${recipient.status === 'failed' ? 'bg-rose-50/30' : ''}`}>
                        <td className="px-6 py-3 font-medium text-slate-900 break-all">{recipient.email}</td>
                        <td className="px-4 py-3 text-slate-600">{recipient.name || '—'}</td>
                        <td className="px-4 py-3">
                          {isOpened ? (
                            <span className="badge badge-green" title="Opened (tracking pixel — estimate)">
                              Opened{recipient.openCount && recipient.openCount > 1 ? ` · ${recipient.openCount}×` : ''}
                            </span>
                          ) : recipient.status === 'sent' ? (
                            <div className="flex items-center gap-2">
                              <StatusBadge kind="email-recipient" status="sent" title="Accepted by the SMTP server" />
                              {import.meta.env.DEV && (
                              <button
                                onClick={() => {
                                  void (async () => {
                                    try {
                                      await fetch(`${apiClient.defaults.baseURL}/tracking/open/${campaign.id}/${recipient.id}.gif`);
                                      toast.success('Open pixel recorded!');
                                      setCampaign(await fetchCampaign(campaign.id));
                                    } catch {
                                      toast.error('Failed to trigger pixel.');
                                    }
                                  })();
                                }}
                                className="text-[11px] text-indigo-600 hover:underline font-medium"
                                title="Development only: records a real open event for this recipient"
                              >
                                [Test Open]
                              </button>
                              )}
                            </div>
                          ) : recipient.status === 'failed' ? (
                            <div className="space-y-1">
                              <StatusBadge kind="email-recipient" status="failed" />
                              {recipient.error && (
                                <p className="text-xs text-rose-700 max-w-md line-clamp-2 break-words" title={recipient.error}>
                                  {recipient.error}
                                </p>
                              )}
                            </div>
                          ) : (
                            <StatusBadge kind="email-recipient" status={recipient.status} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRecipients.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-10 text-center text-slate-400 text-sm">
                        No recipients found matching your filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Email Content Preview */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-sm">Email Content Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-sm max-h-[400px] overflow-auto">
              <div dangerouslySetInnerHTML={{ __html: campaign.body || '<p class="text-slate-400 italic">No content available.</p>' }} className="prose prose-sm max-w-none text-slate-700" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

