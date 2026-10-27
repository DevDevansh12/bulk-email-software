import { boundedRate, summarizeWhatsAppCampaigns } from '@saas/shared';
import type { DashboardStats, CampaignSummary, WhatsAppCampaignSummary } from '@saas/shared';
import {
  Send, Users, Activity, ArrowUpRight, BarChart2, MessageSquare,
  Sparkles, Mail, Zap, Clock, AlertCircle, RefreshCw, Loader2, CalendarClock, XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuthStore } from '@/features/auth/auth.store';
import { fetchDashboardStats, fetchCampaigns } from '@/lib/campaigns-api';
import { fetchWhatsAppCampaigns } from '@/lib/whatsapp-api';


type Loadable<T> = { data: T | null; error: string | null };

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Request failed';
}

function formatRate(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString();
}

interface RecentCampaignRow {
  id: string;
  channel: 'email' | 'whatsapp';
  title: string;
  status: string;
  isSimulation: boolean;
  recipients: number;
  sent: number;
  failed: number;
  createdAt: string;
  href: string;
}

interface ActivityItem {
  key: string;
  channel: 'email' | 'whatsapp';
  at: string;
  text: string;
  tone: 'ok' | 'warn' | 'bad' | 'info';
}

export function DashboardHomePage() {
  const user = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<Loadable<DashboardStats>>({ data: null, error: null });
  const [recentEmail, setRecentEmail] = useState<Loadable<CampaignSummary[]>>({ data: null, error: null });
  const [whatsapp, setWhatsapp] = useState<Loadable<WhatsAppCampaignSummary[]>>({ data: null, error: null });
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    // allSettled: one failing source shows its own error instead of hiding the others
    const [statsRes, campaignsRes, whatsappRes] = await Promise.allSettled([
      fetchDashboardStats(),
      fetchCampaigns(1, 8),
      fetchWhatsAppCampaigns(),
    ]);
    setStats(statsRes.status === 'fulfilled' ? { data: statsRes.value, error: null } : { data: null, error: errorMessage(statsRes.reason) });
    setRecentEmail(
      campaignsRes.status === 'fulfilled'
        ? { data: campaignsRes.value.campaigns, error: null }
        : { data: null, error: errorMessage(campaignsRes.reason) }
    );
    setWhatsapp(whatsappRes.status === 'fulfilled' ? { data: whatsappRes.value, error: null } : { data: null, error: errorMessage(whatsappRes.reason) });
    setUpdatedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Refresh while something is in flight so the status strip stays current
  const hasActiveWork =
    (stats.data?.campaignsByStatus.sending ?? 0) > 0 || (whatsapp.data ?? []).some((c) => c.status === 'sending');
  useEffect(() => {
    if (!hasActiveWork) return;
    const t = setInterval(() => void loadData(), 15_000);
    return () => clearInterval(t);
  }, [hasActiveWork, loadData]);

  const email = stats.data;
  const wa = useMemo(() => (whatsapp.data ? summarizeWhatsAppCampaigns(whatsapp.data) : null), [whatsapp.data]);

  const emailOpenRate = email && email.uniqueOpens !== null ? boundedRate(email.uniqueOpens, email.totalEmailsSent) : null;
  const emailFailureRate = email ? boundedRate(email.totalEmailsFailed, email.totalEmailsSent + email.totalEmailsFailed) : null;
  const waFailureRate = wa ? boundedRate(wa.failed, wa.sent + wa.failed) : null;

  const recentCampaigns = useMemo<RecentCampaignRow[]>(() => {
    const rows: RecentCampaignRow[] = [
      ...(recentEmail.data ?? []).map((c) => ({
        id: c.id,
        channel: 'email' as const,
        title: c.subject,
        status: c.status,
        isSimulation: false,
        recipients: c.totalRecipients,
        sent: c.sentCount,
        failed: c.failedCount,
        createdAt: c.createdAt,
        href: `/dashboard/campaigns/${c.id}`,
      })),
      ...(whatsapp.data ?? []).slice(0, 8).map((c) => ({
        id: c.id,
        channel: 'whatsapp' as const,
        title: c.title,
        status: c.status,
        isSimulation: c.isSimulation,
        recipients: c.totalRecipients,
        sent: c.sentCount,
        failed: c.failedCount,
        createdAt: c.createdAt,
        href: `/dashboard/whatsapp/campaigns/${c.id}`,
      })),
    ];
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  }, [recentEmail.data, whatsapp.data]);

  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const c of recentEmail.data ?? []) {
      if (c.completedAt) {
        items.push({
          key: `e-done-${c.id}`,
          channel: 'email',
          at: c.completedAt,
          tone: c.status === 'failed' ? 'bad' : c.failedCount > 0 ? 'warn' : 'ok',
          text:
            c.status === 'failed'
              ? `"${c.subject}" failed${c.errorMessage ? `: ${c.errorMessage}` : ''}`
              : `"${c.subject}" finished — ${c.sentCount} sent${c.failedCount ? `, ${c.failedCount} failed` : ''}`,
        });
      } else if (c.status === 'sending' && c.startedAt) {
        items.push({ key: `e-start-${c.id}`, channel: 'email', at: c.startedAt, tone: 'info', text: `"${c.subject}" is sending` });
      } else if (c.status === 'scheduled' && c.scheduledAt) {
        items.push({ key: `e-sched-${c.id}`, channel: 'email', at: c.createdAt, tone: 'info', text: `"${c.subject}" scheduled for ${new Date(c.scheduledAt).toLocaleString()}` });
      }
    }
    for (const c of (whatsapp.data ?? []).slice(0, 8)) {
      const at = c.completedAt ?? c.startedAt ?? c.createdAt;
      const label = c.isSimulation ? ' (simulation — nothing sent)' : '';
      items.push({
        key: `w-${c.id}`,
        channel: 'whatsapp',
        at,
        tone: c.isSimulation ? 'info' : c.status === 'failed' ? 'bad' : c.failedCount > 0 ? 'warn' : c.status === 'completed' ? 'ok' : 'info',
        text:
          c.status === 'completed' || c.status === 'failed'
            ? `"${c.title}" — ${c.sentCount} accepted by Meta, ${c.deliveredCount} delivered${c.failedCount ? `, ${c.failedCount} failed` : ''}${label}`
            : `"${c.title}" is ${c.status}${label}`,
      });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [recentEmail.data, whatsapp.data]);

  const errors = [
    stats.error && `Email statistics: ${stats.error}`,
    recentEmail.error && `Recent email campaigns: ${recentEmail.error}`,
    whatsapp.error && `WhatsApp campaigns: ${whatsapp.error}`,
  ].filter(Boolean) as string[];

  const sendingNow = (email?.campaignsByStatus.sending ?? 0) + (wa?.activeCampaigns ?? 0);
  const failedCampaigns = (email?.campaignsByStatus.failed ?? 0) + (whatsapp.data ?? []).filter((c) => !c.isSimulation && c.status === 'failed').length;

  const comparisonMax = Math.max(1, email?.totalEmailsSent ?? 0, wa?.sent ?? 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        {/* Welcome banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 p-6 lg:p-8 text-white shadow-xl">
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-100 border border-white/20">
                <Sparkles className="h-3.5 w-3.5 text-yellow-300" aria-hidden="true" />
                <span>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Welcome back, {user?.firstName || 'User'}!</h1>
              <p className="text-sm text-slate-200 max-w-2xl">
                What's sending, what failed, and how each channel is performing — from your actual campaign data.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/dashboard/campaigns/send" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto justify-center bg-white hover:bg-slate-50 text-indigo-900 font-bold rounded-xl flex items-center gap-2">
                  <Mail className="h-5 w-5" aria-hidden="true" /> Send Email Campaign
                </Button>
              </Link>
              <Link to="/dashboard/whatsapp/send" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" aria-hidden="true" /> Send WhatsApp
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {errors.length > 0 && (
          <Alert variant="error">
            <div className="flex flex-wrap items-start justify-between gap-3 w-full">
              <div>
                <p className="font-semibold">Some dashboard data could not be loaded — the numbers below are incomplete.</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void loadData()} loading={loading}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
              </Button>
            </div>
          </Alert>
        )}

        {/* Right now */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="status-heading" className="text-sm font-bold uppercase tracking-wide text-slate-500">Right now</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {updatedAt && <span aria-live="polite">Updated {updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>}
            <Button variant="ghost" size="sm" onClick={() => void loadData()} disabled={loading} aria-label="Refresh dashboard">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
          </div>
        </div>
        <section aria-labelledby="status-heading" className="grid grid-cols-1 sm:grid-cols-3 gap-4 -mt-3">
          {[
            { label: 'Sending now', value: sendingNow, icon: sendingNow > 0 ? Loader2 : Send, cls: sendingNow > 0 ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-slate-700 bg-white border-slate-200', spin: sendingNow > 0 },
            { label: 'Scheduled (email)', value: email?.campaignsByStatus.scheduled ?? null, icon: CalendarClock, cls: (email?.campaignsByStatus.scheduled ?? 0) > 0 ? 'text-violet-700 bg-violet-50 border-violet-200' : 'text-slate-700 bg-white border-slate-200', spin: false },
            { label: 'Failed campaigns', value: failedCampaigns, icon: XCircle, cls: failedCampaigns > 0 ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-slate-700 bg-white border-slate-200', spin: false },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${s.cls}`}>
                <Icon className={`h-6 w-6 shrink-0 ${s.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
                <div>
                  <p className="text-2xl font-extrabold leading-none">{loading && s.value === null ? '…' : formatNumber(s.value)}</p>
                  <p className="text-xs font-semibold mt-1">{s.label}</p>
                </div>
              </div>
            );
          })}
        </section>

        {/* Channels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-2xl border-2 border-slate-200/60">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-6 py-4">
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <Mail className="h-5 w-5 text-indigo-600" aria-hidden="true" /> Email
              </CardTitle>
              <Link to="/dashboard/analytics" className="text-xs font-semibold text-indigo-600 hover:underline">Email analytics →</Link>
            </CardHeader>
            <CardContent className="p-6">
              {stats.error ? (
                <p className="text-sm text-rose-700">Email statistics are not available right now.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <StatCard loading={loading && !email} label="Campaigns" value={formatNumber(email?.totalCampaigns)} />
                  <StatCard loading={loading && !email} label="Sent" value={formatNumber(email?.totalEmailsSent)} hint="Accepted by SMTP server" />
                  <StatCard loading={loading && !email} highlight={(email?.totalEmailsFailed ?? 0) > 0} label="Failed" value={formatNumber(email?.totalEmailsFailed)} hint={`${formatRate(emailFailureRate)} of attempted`} />
                  <StatCard loading={loading && !email} label="Pending" value={formatNumber(email?.totalEmailsPending)} hint="Scheduled or in progress" />
                  <StatCard
                    loading={loading && !email}
                    label="Unique opens"
                    value={email?.uniqueOpens === null ? 'Not available' : formatNumber(email?.uniqueOpens)}
                    hint={email?.uniqueOpens === null ? 'Apply the latest DB migration' : `Open rate ${formatRate(emailOpenRate)} of sent (estimate)`}
                  />
                  <StatCard
                    loading={loading && !email}
                    label="Recipients"
                    value={formatNumber(email?.totalRecipients)}
                    hint="Sum across campaigns — not unique people"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-2 border-slate-200/60">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-6 py-4">
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-600" aria-hidden="true" /> WhatsApp
              </CardTitle>
              <Link to="/dashboard/whatsapp" className="text-xs font-semibold text-emerald-700 hover:underline">WhatsApp campaigns →</Link>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              {whatsapp.error ? (
                <p className="text-sm text-rose-700">WhatsApp campaign data is not available right now.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <StatCard loading={loading && !wa} label="Campaigns" value={formatNumber(wa?.campaigns)} />
                  <StatCard loading={loading && !wa} label="Accepted" value={formatNumber(wa?.sent)} hint="Accepted by Meta API" />
                  <StatCard loading={loading && !wa} label="Delivered" value={formatNumber(wa?.delivered)} hint={`${formatRate(wa?.deliveryRate ?? null)} of accepted (webhook)`} />
                  <StatCard loading={loading && !wa} label="Read" value={formatNumber(wa?.read)} hint={`${formatRate(wa?.readRate ?? null)} of delivered`} />
                  <StatCard loading={loading && !wa} highlight={(wa?.failed ?? 0) > 0} label="Failed" value={formatNumber(wa?.failed)} hint={`${formatRate(waFailureRate)} of attempted`} />
                  <StatCard loading={loading && !wa} label="Recipients" value={formatNumber(wa?.recipients)} hint="Sum across campaigns" />
                </div>
              )}
              {wa && wa.simulatedCampaigns > 0 && (
                <p className="text-xs text-violet-700">
                  {wa.simulatedCampaigns} simulated campaign(s) excluded — simulations send nothing.
                </p>
              )}
              {wa && wa.sent > 0 && wa.delivered === 0 && (
                <p className="text-xs text-amber-700">
                  No delivery receipts yet. Delivered/read counts need the Meta webhook (see WhatsApp setup guide).
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Channel comparison */}
        {email && wa && (email.totalEmailsSent > 0 || wa.sent > 0) && (
          <Card className="rounded-2xl border-2 border-slate-200/60">
            <CardHeader className="px-6 py-4 border-b border-slate-100">
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-purple-600" aria-hidden="true" /> Channel comparison
              </CardTitle>
              <p className="text-xs text-slate-500">
                Messages accepted by each provider (SMTP server / Meta). Different channels are not the same people.
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {[
                { label: 'Email', sent: email.totalEmailsSent, failRate: emailFailureRate, cls: 'bg-indigo-500' },
                { label: 'WhatsApp', sent: wa.sent, failRate: waFailureRate, cls: 'bg-emerald-500' },
              ].map((row) => (
                <div key={row.label} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 text-sm">
                  <span className="font-semibold text-slate-700">{row.label}</span>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                    <div className={`h-full rounded-full ${row.cls}`} style={{ width: `${(row.sent / comparisonMax) * 100}%` }} />
                  </div>
                  <span className="text-xs text-slate-600 whitespace-nowrap">
                    {row.sent.toLocaleString()} sent · {formatRate(row.failRate)} failed
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Recent campaigns + activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="bg-white border-2 border-slate-200/60 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-slate-100 px-6 py-4 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-extrabold flex items-center gap-2">
                  <Activity className="h-5 w-5 text-indigo-600" aria-hidden="true" /> Recent campaigns
                </CardTitle>
                <Link to="/dashboard/campaigns">
                  <Button variant="ghost" size="sm" className="font-bold text-indigo-600">
                    All email campaigns <ArrowUpRight className="h-4 w-4 ml-1" aria-hidden="true" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                        <th scope="col" className="px-6 py-3 font-bold text-slate-600 text-xs uppercase">Campaign</th>
                        <th scope="col" className="px-4 py-3 font-bold text-slate-600 text-xs uppercase">Status</th>
                        <th scope="col" className="px-4 py-3 font-bold text-slate-600 text-xs uppercase">Recipients</th>
                        <th scope="col" className="px-4 py-3 font-bold text-slate-600 text-xs uppercase">Sent</th>
                        <th scope="col" className="px-4 py-3 font-bold text-slate-600 text-xs uppercase">Failed</th>
                        <th scope="col" className="px-4 py-3 font-bold text-slate-600 text-xs uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading && recentCampaigns.length === 0 ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <tr key={i}>
                            <td className="px-6 py-4" colSpan={6}><div className="h-4 w-full bg-slate-200 rounded animate-pulse" /></td>
                          </tr>
                        ))
                      ) : recentCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center">
                            <p className="font-bold text-slate-900">{errors.length > 0 ? 'Campaigns could not be loaded' : 'No campaigns yet'}</p>
                            {errors.length === 0 && (
                              <Link to="/dashboard/campaigns/send">
                                <Button size="sm" className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg">
                                  <Send className="h-4 w-4 mr-2" aria-hidden="true" /> Create Campaign
                                </Button>
                              </Link>
                            )}
                          </td>
                        </tr>
                      ) : (
                        recentCampaigns.map((c) => (
                          <tr key={`${c.channel}-${c.id}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3">
                              <Link to={c.href} className="flex items-center gap-2 font-bold text-slate-900 hover:text-indigo-600">
                                {c.channel === 'email' ? (
                                  <Mail className="h-4 w-4 text-indigo-500 shrink-0" aria-label="Email" />
                                ) : (
                                  <MessageSquare className="h-4 w-4 text-emerald-600 shrink-0" aria-label="WhatsApp" />
                                )}
                                <span className="truncate max-w-[260px]">{c.title}</span>
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={c.status} isSimulation={c.isSimulation} hasFailures={c.failed > 0} />
                            </td>
                            <td className="px-4 py-3 text-slate-700">{c.recipients.toLocaleString()}</td>
                            <td className="px-4 py-3 font-semibold text-emerald-700">{c.isSimulation ? '—' : c.sent.toLocaleString()}</td>
                            <td className={`px-4 py-3 font-semibold ${c.failed > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{c.failed.toLocaleString()}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                              {new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="bg-white border-2 border-slate-200/60 rounded-2xl p-6">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-blue-500" aria-hidden="true" /> Recent activity
              </h3>
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.key} className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${
                        a.tone === 'ok' ? 'bg-emerald-500' : a.tone === 'warn' ? 'bg-amber-500' : a.tone === 'bad' ? 'bg-rose-500' : 'bg-blue-400'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 break-words">
                        <span className="font-semibold">{a.channel === 'email' ? 'Email' : 'WhatsApp'}:</span> {a.text}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(a.at).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
                {!loading && activity.length === 0 && (
                  <li className="text-sm text-slate-500 text-center py-4">{errors.length > 0 ? 'Not available' : 'No recent activity'}</li>
                )}
              </ul>
            </Card>

            <Card className="bg-white border-2 border-slate-200/60 rounded-2xl p-6">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-amber-500" aria-hidden="true" /> Quick actions
              </h3>
              <div className="space-y-2">
                {[
                  { to: '/dashboard/audiences', icon: Users, title: 'Audience lists', desc: 'Import & manage contacts' },
                  { to: '/dashboard/whatsapp/templates', icon: MessageSquare, title: 'WhatsApp templates', desc: 'Sync approved templates from Meta' },
                  { to: '/dashboard/campaigns/templates', icon: Sparkles, title: 'Email templates', desc: 'Design & save templates' },
                  { to: '/dashboard/settings', icon: AlertCircle, title: 'Sending setup', desc: 'SMTP & WhatsApp credentials' },
                ].map((q) => {
                  const Icon = q.icon;
                  return (
                    <Link key={q.to} to={q.to} className="group flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors">
                      <Icon className="h-5 w-5 text-indigo-600 shrink-0" aria-hidden="true" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{q.title}</p>
                        <p className="text-xs text-slate-600">{q.desc}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
