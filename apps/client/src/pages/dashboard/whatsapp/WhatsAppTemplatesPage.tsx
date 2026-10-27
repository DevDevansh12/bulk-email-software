import type { WhatsAppTemplate } from '@saas/shared';
import { Plus, CheckCircle2, Clock, FileText, RefreshCw, XCircle, PenLine, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { fetchWhatsAppTemplates, createWhatsAppTemplate, syncWhatsAppTemplates } from '@/lib/whatsapp-api';


function StatusBadge({ template }: { template: WhatsAppTemplate }) {
  if (template.status === 'LOCAL_DRAFT') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
        <PenLine className="h-3 w-3" aria-hidden="true" /> Local draft · not approved
      </span>
    );
  }
  if (template.status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Approved by Meta
      </span>
    );
  }
  const pending = template.status === 'PENDING' || template.status === 'IN_APPEAL';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${pending ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200'}`}>
      {pending ? <Clock className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />} {template.status}
    </span>
  );
}

export function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('en_US');
  const [bodyText, setBodyText] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetchWhatsAppTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load templates.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncWhatsAppTemplates();
      setTemplates(result.templates);
      toast.success(`Synced ${result.synced} template(s) from Meta — ${result.approved} approved.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Template sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createWhatsAppTemplate({ name, category, language, bodyText });
      setTemplates((prev) => [created, ...prev]);
      setShowModal(false);
      setName('');
      setBodyText('');
      toast.info('Draft saved locally. It is not submitted to Meta — create it in WhatsApp Manager, then sync.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft.');
    }
  };

  const synced = templates.filter((t) => t.metaTemplateId);
  const drafts = templates.filter((t) => !t.metaTemplateId);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">WhatsApp Templates</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Business-initiated WhatsApp messages must use a template approved by Meta. Create and submit templates in{' '}
            <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noreferrer" className="underline">
              WhatsApp Manager
            </a>
            , then sync them here to send.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleSync()} loading={syncing} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Sync from Meta
          </Button>
          <Button variant="secondary" className="rounded-xl flex items-center gap-2" onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New local draft
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center gap-3"><span>{error}</span><Button variant="secondary" size="sm" onClick={load}>Retry</Button></div>
        </Alert>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-2" aria-hidden="true" /> Loading templates...
        </div>
      ) : templates.length === 0 && !error ? (
        <Card className="card-modern p-12 text-center space-y-3">
          <FileText className="h-8 w-8 text-emerald-600 mx-auto" aria-hidden="true" />
          <h3 className="text-lg font-bold text-slate-900">No templates yet</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Click <strong>Sync from Meta</strong> to import your approved templates. This needs your WhatsApp Business Account ID in{' '}
            <Link to="/dashboard/settings" className="underline">Settings</Link>.
          </p>
        </Card>
      ) : (
        <>
          {synced.length > 0 && (
            <section aria-labelledby="synced-heading" className="space-y-3">
              <h2 id="synced-heading" className="text-sm font-bold uppercase tracking-wide text-slate-500">From Meta ({synced.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {synced.map((t) => <TemplateCard key={t.id} template={t} />)}
              </div>
            </section>
          )}
          {drafts.length > 0 && (
            <section aria-labelledby="drafts-heading" className="space-y-3">
              <h2 id="drafts-heading" className="text-sm font-bold uppercase tracking-wide text-slate-500">Local drafts ({drafts.length}) — cannot be sent</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {drafts.map((t) => <TemplateCard key={t.id} template={t} />)}
              </div>
            </section>
          )}
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="draft-title">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 id="draft-title" className="text-lg font-bold text-slate-900">New local draft</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm" aria-label="Close">✕</button>
            </div>
            <Alert variant="info">
              Drafts stay in this app only and are <strong>not</strong> submitted to Meta. Use them to plan wording, then create the
              template in WhatsApp Manager (variables as {'{{1}}'}, {'{{2}}'}…) and sync.
            </Alert>
            <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
              <Input label="Template name" placeholder="summer_promo_alert" value={name} onChange={(e) => setName(e.target.value)} required />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tpl-category" className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select id="tpl-category" className="w-full border rounded-md h-10 px-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="MARKETING">MARKETING</option>
                    <option value="UTILITY">UTILITY</option>
                    <option value="AUTHENTICATION">AUTHENTICATION</option>
                  </select>
                </div>
                <Input label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en_US" />
              </div>
              <div>
                <label htmlFor="tpl-body" className="block text-sm font-medium text-slate-700 mb-1">Body</label>
                <textarea id="tpl-body" rows={4} className="w-full border rounded-xl p-2.5 text-sm" value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Hello {{1}}, check out our summer special..." required />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl">Save draft</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template: t }: { template: WhatsAppTemplate }) {
  return (
    <Card className="card-modern p-5 flex flex-col justify-between space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full uppercase">{t.category}</span>
          <StatusBadge template={t} />
        </div>
        <h3 className="font-bold text-slate-900 text-base mt-3 break-words">{t.name}</h3>
        <p className="text-xs text-slate-500">{t.language}{t.variables.length > 0 && ` · variables: ${t.variables.map((v) => `{{${v}}}`).join(', ')}`}</p>
        <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap leading-relaxed">{t.bodyText || '(no body text)'}</p>
        {t.unsupportedReason && <p className="mt-2 text-xs text-amber-700">Can't be sent from this app: {t.unsupportedReason}</p>}
      </div>
      <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">
        {t.syncedAt ? `Synced ${new Date(t.syncedAt).toLocaleString()}` : `Created ${new Date(t.createdAt).toLocaleDateString()}`}
      </p>
    </Card>
  );
}
