import type {
  WhatsAppMessageMode,
  WhatsAppParsePreviewResponse,
  WhatsAppTemplate,
} from '@saas/shared';
import { Upload, Send, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, Copy, Download, Check, XCircle, Loader2, FlaskConical, RefreshCw } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import {
  fetchWhatsAppConfig,
  fetchWhatsAppTemplates,
  parseWhatsAppCsv,
  sendWhatsAppCampaign,
  type WhatsAppDispatchResult,
  type WhatsAppEffectiveSender,
  type WhatsAppListOptions,
} from '@/lib/whatsapp-api';


type Step = 1 | 2 | 3 | 4;

interface LogEntry {
  recipientId: string;
  phone: string;
  status: 'sent' | 'failed' | 'simulated';
  reason?: string | undefined;
}

const PREVIEW_ROWS = 50;

function renderPreviewText(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w ]+?)\s*\}\}/g, (match, key: string) => values[key] ?? values[key.toLowerCase()] ?? match);
}

export function SendWhatsAppCampaignPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // Recipients
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [defaultCountryCode, setDefaultCountryCode] = useState('');
  const [phoneColumn, setPhoneColumn] = useState('');
  const [preview, setPreview] = useState<WhatsAppParsePreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // Message
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState('');
  const [mode, setMode] = useState<WhatsAppMessageMode>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variableColumns, setVariableColumns] = useState<Record<string, string>>({});
  const [customBody, setCustomBody] = useState('');
  const [effectiveSender, setEffectiveSender] = useState<WhatsAppEffectiveSender | null>(null);

  // Dispatch
  const [isSending, setIsSending] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [isSimulation, setIsSimulation] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, failed: 0, simulated: 0, total: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [outcome, setOutcome] = useState<WhatsAppDispatchResult | null>(null);
  const [copiedFailed, setCopiedFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadTemplates = useCallback(() => {
    setTemplatesError('');
    fetchWhatsAppTemplates()
      .then(setTemplates)
      .catch((err) => setTemplatesError(err instanceof Error ? err.message : 'Failed to load templates'));
  }, []);

  useEffect(() => {
    loadTemplates();
    fetchWhatsAppConfig()
      .then((c) => setEffectiveSender(c.effectiveSender))
      .catch(() => setEffectiveSender(null));
  }, [loadTemplates]);

  // Abort the progress stream if the user leaves the page (sending continues server-side)
  useEffect(() => () => abortRef.current?.abort(), []);

  const approvedTemplates = templates.filter((t) => t.status === 'APPROVED' && t.metaTemplateId && !t.unsupportedReason);
  const otherTemplates = templates.filter((t) => !approvedTemplates.includes(t));
  const selectedTemplate = approvedTemplates.find((t) => t.id === selectedTemplateId) ?? null;
  const templateVariables = mode === 'template' ? selectedTemplate?.variables ?? [] : [];
  const allVariablesMapped = templateVariables.every((v) => variableColumns[v]);

  const listOptions = useMemo(
    () => ({
      phoneColumn: phoneColumn || undefined,
      defaultCountryCode: defaultCountryCode || undefined,
      ...(mode === 'template' && selectedTemplate
        ? { templateId: selectedTemplate.id, variableColumns }
        : {}),
    }),
    [phoneColumn, defaultCountryCode, mode, selectedTemplate, variableColumns]
  );

  /** Ask the server to validate — the same rules the send endpoint applies. */
  const runPreview = useCallback(
    async (target: File, options: WhatsAppListOptions = listOptions) => {
      setIsParsing(true);
      setPreviewError('');
      try {
        const data = await parseWhatsAppCsv(target, options);
        setPreview(data);
        if (!phoneColumn && data.phoneColumn) setPhoneColumn(data.phoneColumn);
        return data;
      } catch (err) {
        setPreview(null);
        setPreviewError(err instanceof Error ? err.message : 'Failed to read the file.');
        return null;
      } finally {
        setIsParsing(false);
      }
    },
    [listOptions, phoneColumn]
  );

  const handleFileUpload = async (f: File) => {
    setFile(f);
    setPhoneColumn('');
    const data = await runPreview(f, { defaultCountryCode: defaultCountryCode || undefined });
    if (data) toast.success(`${data.totalValid} valid phone number(s) found.`);
  };

  // Auto-map variables to identically-named columns
  useEffect(() => {
    if (!selectedTemplate || !preview) return;
    setVariableColumns((prev) => {
      const next: Record<string, string> = {};
      for (const v of selectedTemplate.variables) {
        next[v] = prev[v] ?? (preview.columns.includes(v.toLowerCase()) ? v.toLowerCase() : '');
      }
      return next;
    });
  }, [selectedTemplate, preview]);

  const goToReview = async () => {
    if (!file) return;
    // Re-validate with the chosen template + mapping before showing the review
    const data = await runPreview(file);
    if (data && data.totalValid > 0) setStep(3);
    else if (data) toast.error('No sendable recipients with this template mapping — check the rows marked invalid.');
  };

  const sampleRecipient = preview?.recipients.find((r) => r.valid);
  const sampleText = useMemo(() => {
    if (mode === 'template' && selectedTemplate) {
      const values: Record<string, string> = {};
      selectedTemplate.variables.forEach((v, i) => {
        values[v] = sampleRecipient?.variableValues?.[i] ?? `{{${v}}}`;
      });
      return renderPreviewText(selectedTemplate.bodyText, values);
    }
    return renderPreviewText(customBody, { name: sampleRecipient?.name ?? 'Friend' });
  }, [mode, selectedTemplate, sampleRecipient, customBody]);

  const failedLogs = useMemo(() => logs.filter((l) => l.status === 'failed'), [logs]);

  const startDispatch = async () => {
    if (!file) return;
    setIsSending(true);
    setStep(4);
    setLogs([]);
    setOutcome(null);
    setCampaignId(null);
    setProgress({ sent: 0, failed: 0, simulated: 0, total: preview?.totalValid ?? 0 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await sendWhatsAppCampaign(
        {
          file,
          title: title.trim() || 'WhatsApp Campaign',
          messageMode: mode,
          bodyText: mode === 'text' ? customBody : undefined,
          ...listOptions,
        },
        {
          onStart: (data) => {
            setCampaignId(data.campaignId);
            setIsSimulation(data.isSimulation);
            setProgress((p) => ({ ...p, total: data.total }));
          },
          onProgress: (data) => {
            setProgress({ sent: data.sent, failed: data.failed, simulated: data.simulated, total: data.total });
            setLogs((prev) => [{ recipientId: data.recipientId, phone: data.phone, status: data.status, reason: data.reason }, ...prev]);
          },
        },
        controller.signal
      );
      setOutcome(result);
      if (result.kind === 'completed') {
        const r = result.result;
        if (r.outcome === 'success') toast.success(`All ${r.sent} messages accepted by Meta.`);
        else if (r.outcome === 'partial') toast.warning(`${r.sent} accepted, ${r.failed} rejected by Meta.`);
        else if (r.outcome === 'simulated') toast.info('Simulation finished — no messages were sent.');
        else toast.error('All messages were rejected by Meta.');
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      setOutcome({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to start dispatch.' });
      toast.error(err instanceof Error ? err.message : 'Failed to start dispatch.');
      setStep(3);
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  };

  const copyFailedNumbers = () => {
    if (failedLogs.length === 0) return;
    void navigator.clipboard.writeText(failedLogs.map((l) => `+${l.phone}`).join('\n'));
    setCopiedFailed(true);
    toast.success(`Copied ${failedLogs.length} failed phone numbers.`);
    setTimeout(() => setCopiedFailed(false), 2500);
  };

  const exportFailedCsv = () => {
    if (failedLogs.length === 0) return;
    const rows = failedLogs.map((l) => `"+${l.phone}","failed","${(l.reason || 'Rejected').replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([`phone,status,reason\n${rows}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `failed-whatsapp-${title.slice(0, 20) || 'campaign'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    setStep(1);
    setLogs([]);
    setPreview(null);
    setFile(null);
    setOutcome(null);
    setCampaignId(null);
  };

  const processed = progress.sent + progress.failed + progress.simulated;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Send WhatsApp Campaign</h1>
        <p className="text-sm text-slate-500 mt-1">Send approved Meta templates (or 24-hour session messages) via the WhatsApp Cloud API.</p>
      </div>

      {effectiveSender === 'none' && (
        <Alert variant="error">
          WhatsApp is not configured. Add your credentials in{' '}
          <Link to="/dashboard/settings" className="underline font-semibold">Settings → WhatsApp Config</Link> before sending.
        </Alert>
      )}
      {effectiveSender === 'simulation' && (
        <Alert variant="warning">
          <span className="inline-flex items-center gap-1.5 font-semibold"><FlaskConical className="h-4 w-4" /> Simulation mode (development)</span>
          <span className="block text-sm">No credentials are configured, so this campaign will be recorded as a simulation. No messages will be sent and nothing will count as delivered.</span>
        </Alert>
      )}

      {/* Stepper */}
      <ol className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
        {[
          { num: 1, label: 'Recipients' },
          { num: 2, label: 'Message' },
          { num: 3, label: 'Review' },
          { num: 4, label: 'Dispatch' },
        ].map((s) => (
          <li key={s.num} className="flex items-center gap-2" aria-current={step === s.num ? 'step' : undefined}>
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s.num ? 'bg-emerald-600 text-white' : step > s.num ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {step > s.num ? '✓' : s.num}
            </span>
            <span className={`text-xs font-bold ${step === s.num ? 'text-slate-900' : 'text-slate-400'}`}>{s.label}</span>
          </li>
        ))}
      </ol>

      {/* Step 1: Recipients */}
      {step === 1 && (
        <Card className="card-modern p-6 space-y-5">
          <Input label="Campaign Title" placeholder="e.g. Summer Special WhatsApp Alert" value={title} onChange={(e) => setTitle(e.target.value)} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Default country code (optional)"
              placeholder="e.g. 91 or 1"
              value={defaultCountryCode}
              onChange={(e) => setDefaultCountryCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              hint="Applied only to numbers written without a country code (leading 0 or 10 digits or fewer)."
            />
            {preview && (
              <div>
                <label htmlFor="wa-phone-column" className="block text-sm font-medium text-slate-700 mb-1">Phone column</label>
                <select
                  id="wa-phone-column"
                  className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm"
                  value={phoneColumn}
                  onChange={(e) => setPhoneColumn(e.target.value)}
                >
                  {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="border-2 border-dashed border-emerald-200 bg-emerald-50/30 rounded-2xl p-6 text-center">
            <Upload className="h-7 w-7 text-emerald-700 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-800">Upload phone numbers (CSV or Excel)</p>
            <p className="text-xs text-slate-500 mt-1">International format is safest, e.g. +919876543210 or +14155550123.</p>
            <a href="/sample-whatsapp-clients.csv" download="sample-whatsapp-clients.csv" className="inline-block text-xs font-bold text-emerald-700 mt-2 underline">
              Download sample CSV
            </a>
            <div className="mt-3">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                aria-label="Recipients file"
                className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white cursor-pointer"
                onChange={(e) => e.target.files?.[0] && void handleFileUpload(e.target.files[0])}
              />
            </div>
          </div>

          {isParsing && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Validating…</p>}
          {previewError && <Alert variant="error">{previewError}</Alert>}

          {file && preview && (
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => void runPreview(file)} disabled={isParsing}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-check with these settings
              </Button>
            </div>
          )}

          {preview && <PreviewSummary preview={preview} />}

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <Button
              disabled={!preview || preview.totalValid === 0 || isParsing}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2"
              onClick={() => setStep(2)}
            >
              Next: Message <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Message */}
      {step === 2 && preview && (
        <Card className="card-modern p-6 space-y-6">
          <fieldset>
            <legend className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Message type</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { value: 'template', title: 'Approved template', desc: 'Required for broadcasts. Uses a template Meta has approved.', badge: 'Recommended' },
                { value: 'text', title: 'Free-form text', desc: 'Only delivered to people who messaged you in the last 24 hours.', badge: '24h window' },
              ] as const).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={mode === o.value}
                  onClick={() => setMode(o.value)}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    mode === o.value ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{o.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.value === 'template' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {o.badge}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">{o.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {mode === 'text' && (
            <Alert variant="warning">
              WhatsApp only delivers free-form text to people who messaged your business in the last 24 hours. Everyone else is
              rejected by Meta (error 131047). Use an approved template for broadcasts.
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {mode === 'template' ? (
                <>
                  {templatesError && (
                    <Alert variant="error">
                      Templates could not be loaded: {templatesError}{' '}
                      <button type="button" className="underline" onClick={loadTemplates}>Retry</button>
                    </Alert>
                  )}
                  {approvedTemplates.length === 0 && !templatesError && (
                    <Alert variant="info">
                      No Meta-approved templates yet.{' '}
                      <Link to="/dashboard/whatsapp/templates" className="underline font-semibold">Sync templates from Meta</Link> first.
                    </Alert>
                  )}
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1" role="radiogroup" aria-label="Approved templates">
                    {approvedTemplates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={selectedTemplateId === t.id}
                        onClick={() => setSelectedTemplateId(t.id)}
                        className={`w-full text-left p-3 rounded-xl border ${selectedTemplateId === t.id ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white'}`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">{t.category}</span>
                          <span className="text-emerald-700">APPROVED · {t.language}</span>
                        </div>
                        <p className="font-bold text-slate-900 mt-1 text-sm">{t.name}</p>
                        <p className="text-xs text-slate-600 line-clamp-2">{t.bodyText}</p>
                      </button>
                    ))}
                  </div>
                  {otherTemplates.length > 0 && (
                    <p className="text-xs text-slate-500">
                      {otherTemplates.length} template(s) hidden: local drafts, not approved, or using unsupported components.
                    </p>
                  )}

                  {selectedTemplate && selectedTemplate.variables.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Map template variables to columns</p>
                      {selectedTemplate.variables.map((v) => (
                        <div key={v} className="flex items-center gap-2">
                          <label htmlFor={`var-${v}`} className="w-24 font-mono text-xs text-slate-700">{`{{${v}}}`}</label>
                          <select
                            id={`var-${v}`}
                            className="flex-1 h-9 rounded-md border border-slate-200 px-2 text-sm"
                            value={variableColumns[v] ?? ''}
                            onChange={(e) => setVariableColumns((prev) => ({ ...prev, [v]: e.target.value }))}
                          >
                            <option value="">— choose a column —</option>
                            {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label htmlFor="wa-body" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Message text (supports {'{{column}}'} placeholders)
                  </label>
                  <textarea
                    id="wa-body"
                    rows={5}
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    placeholder="Hi {{name}}, thanks for your message…"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Preview (first valid recipient)</p>
              <div className="bg-[#e5ddd5] rounded-2xl p-4 min-h-[220px] flex flex-col justify-end">
                <div className="bg-[#dcf8c6] text-slate-900 p-3 rounded-2xl rounded-tr-none max-w-[85%] ml-auto shadow-sm text-sm">
                  <p className="whitespace-pre-wrap break-words">{sampleText || 'Select a template or write a message.'}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Illustration only — WhatsApp renders the final message.</p>
            </div>
          </div>

          {previewError && <Alert variant="error">{previewError}</Alert>}

          <div className="flex justify-between pt-4 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl"
              disabled={isParsing || (mode === 'template' ? !selectedTemplate || !allVariablesMapped : !customBody.trim())}
              onClick={() => void goToReview()}
            >
              {isParsing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Review <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && preview && (
        <Card className="card-modern p-6 space-y-6">
          <h3 className="font-bold text-slate-900 text-base">Review</h3>
          <dl className="bg-slate-50 p-5 rounded-2xl space-y-2 text-sm border border-slate-200/60">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Title</dt><dd className="font-semibold text-slate-900">{title || 'WhatsApp Campaign'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Will be sent to</dt><dd className="font-semibold text-emerald-700">{preview.totalValid} unique number(s)</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Skipped</dt><dd className="text-slate-700">{preview.totalInvalid} invalid · {preview.duplicateCount} duplicate</dd></div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Message</dt>
              <dd className="text-slate-700 text-right">
                {mode === 'template' && selectedTemplate ? `Template "${selectedTemplate.name}" (${selectedTemplate.language})` : 'Free-form text (24h window)'}
              </dd>
            </div>
            <div className="pt-2">
              <dt className="text-slate-500 mb-1">Sample</dt>
              <dd className="p-3 bg-white rounded-xl border border-slate-200 whitespace-pre-wrap break-words">{sampleText}</dd>
            </div>
          </dl>
          {outcome?.kind === 'error' && <Alert variant="error">{outcome.message}</Alert>}
          <div className="flex justify-between pt-4 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2"
              disabled={effectiveSender === 'none'}
              onClick={() => void startDispatch()}
            >
              <Send className="h-4 w-4" /> {effectiveSender === 'simulation' ? 'Run Simulation' : 'Start Dispatch'}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Dispatch */}
      {step === 4 && (
        <Card className="card-modern p-6 space-y-6">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              {isSending ? 'Dispatching…' : outcome ? outcomeTitle(outcome) : 'Dispatch'}
            </h3>
            {isSimulation && (
              <p className="text-xs font-semibold text-violet-700 mt-1 inline-flex items-center gap-1">
                <FlaskConical className="h-3.5 w-3.5" /> SIMULATION — no messages are being sent
              </p>
            )}
          </div>

          <div aria-live="polite">
            <div className="flex justify-between text-xs font-bold text-slate-700 mb-2">
              <span>{isSending ? 'Sending to Meta…' : 'Finished'}</span>
              <span>{processed} / {progress.total} processed</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={processed}>
              <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${progress.total > 0 ? Math.round((processed / progress.total) * 100) : 0}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><p className="text-[10px] font-bold text-slate-500 uppercase">Total</p><p className="text-xl font-bold">{progress.total}</p></div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><p className="text-[10px] font-bold text-emerald-700 uppercase">{isSimulation ? 'Simulated' : 'Accepted by Meta'}</p><p className="text-xl font-bold text-emerald-700">{isSimulation ? progress.simulated : progress.sent}</p></div>
            <div className={`p-3 rounded-xl border ${progress.failed > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}><p className="text-[10px] font-bold uppercase text-rose-700">Rejected</p><p className="text-xl font-bold text-rose-700">{progress.failed}</p></div>
          </div>

          {outcome && outcome.kind !== 'completed' && (
            <Alert variant={outcome.kind === 'interrupted' ? 'warning' : 'error'}>{outcome.message}</Alert>
          )}
          {outcome?.kind === 'completed' && outcome.result.persistenceErrors > 0 && (
            <Alert variant="warning">
              {outcome.result.persistenceErrors} status update(s) could not be saved, so the campaign page may be incomplete.
            </Alert>
          )}
          {outcome?.kind === 'completed' && !isSimulation && outcome.result.sent > 0 && (
            <p className="text-xs text-slate-500">
              "Accepted" means Meta queued the message. Delivered/read updates arrive via the webhook and show on the campaign page.
            </p>
          )}

          {failedLogs.length > 0 && (
            <div className="border border-rose-200 bg-rose-50/50 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-rose-900 text-sm flex items-center gap-2"><XCircle className="w-4 h-4" /> Rejected ({failedLogs.length})</h4>
                <div className="flex gap-2">
                  <button type="button" onClick={copyFailedNumbers} className="bg-white border border-rose-200 text-rose-700 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                    {copiedFailed ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy numbers
                  </button>
                  <button type="button" onClick={exportFailedCsv} className="bg-white border border-rose-200 text-rose-700 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                    <Download className="w-3 h-3" /> Export CSV
                  </button>
                </div>
              </div>
              <ul className="max-h-48 overflow-y-auto space-y-1.5 divide-y divide-rose-100 text-xs">
                {failedLogs.map((item) => (
                  <li key={item.recipientId} className="pt-1.5 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="font-mono font-bold text-slate-800">+{item.phone}</span>
                    <span className="text-rose-700">{item.reason || 'Rejected by Meta'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-slate-950 text-emerald-400 font-mono text-xs p-4 rounded-2xl max-h-56 overflow-y-auto space-y-1">
            {logs.map((log) => (
              <div key={log.recipientId} className="flex justify-between gap-2">
                <span>+{log.phone}</span>
                <span className={log.status === 'failed' ? 'text-rose-400' : log.status === 'simulated' ? 'text-violet-300' : 'text-emerald-400'}>
                  {log.status === 'sent' ? '✓ accepted by Meta' : log.status === 'simulated' ? '◌ simulated (not sent)' : '✗ rejected'}
                </span>
              </div>
            ))}
            {logs.length === 0 && <div className="text-slate-500">{isSending ? 'Waiting for the first result…' : 'No results.'}</div>}
          </div>

          {!isSending && (
            <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-slate-100">
              <Button variant="secondary" onClick={resetAll}>Send another campaign</Button>
              <div className="flex gap-2">
                {campaignId && (
                  <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl" onClick={() => navigate(`/dashboard/whatsapp/campaigns/${campaignId}`)}>
                    View campaign status
                  </Button>
                )}
                <Button variant="secondary" onClick={() => navigate('/dashboard/whatsapp')}>All WhatsApp campaigns</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function outcomeTitle(outcome: WhatsAppDispatchResult): string {
  if (outcome.kind === 'interrupted') return 'Progress stream interrupted';
  if (outcome.kind === 'error') return 'Dispatch stopped';
  switch (outcome.result.outcome) {
    case 'success':
      return 'All messages accepted by Meta';
    case 'partial':
      return 'Finished with some rejections';
    case 'simulated':
      return 'Simulation finished — nothing was sent';
    default:
      return 'All messages were rejected';
  }
}

function PreviewSummary({ preview }: { preview: WhatsAppParsePreviewResponse }) {
  const [filter, setFilter] = useState<'all' | 'invalid' | 'duplicate'>('all');
  const rows = preview.recipients.filter((r) => filter === 'all' || r.status === filter).slice(0, PREVIEW_ROWS);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2"><p className="text-lg font-bold">{preview.totalRows}</p><p className="text-[10px] uppercase font-bold text-slate-500">Rows</p></div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2"><p className="text-lg font-bold text-emerald-700">{preview.totalValid}</p><p className="text-[10px] uppercase font-bold text-emerald-700">Will be sent</p></div>
        <button type="button" onClick={() => setFilter(filter === 'invalid' ? 'all' : 'invalid')} className="rounded-lg border border-rose-200 bg-rose-50 p-2" aria-pressed={filter === 'invalid'}>
          <p className="text-lg font-bold text-rose-700">{preview.totalInvalid}</p><p className="text-[10px] uppercase font-bold text-rose-700">Invalid (skipped)</p>
        </button>
        <button type="button" onClick={() => setFilter(filter === 'duplicate' ? 'all' : 'duplicate')} className="rounded-lg border border-amber-200 bg-amber-50 p-2" aria-pressed={filter === 'duplicate'}>
          <p className="text-lg font-bold text-amber-700">{preview.duplicateCount}</p><p className="text-[10px] uppercase font-bold text-amber-700">Duplicates (skipped)</p>
        </button>
      </div>
      {!preview.phoneColumn && <Alert variant="error">No phone column detected — pick one above or add a "phone" header.</Alert>}
      <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-72">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="text-left text-slate-600">
              <th scope="col" className="px-3 py-2">Row</th>
              <th scope="col" className="px-3 py-2">In file</th>
              <th scope="col" className="px-3 py-2">Will send to</th>
              <th scope="col" className="px-3 py-2">Name</th>
              <th scope="col" className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={`${r.rowNumber}-${r.rawPhone}`} className={r.status === 'invalid' ? 'bg-rose-50/40' : r.status === 'duplicate' ? 'bg-amber-50/40' : ''}>
                <td className="px-3 py-1.5 text-slate-400">{r.rowNumber}</td>
                <td className="px-3 py-1.5 font-mono">{r.rawPhone || '—'}</td>
                <td className="px-3 py-1.5 font-mono">{r.phone ? `+${r.phone}` : '—'}</td>
                <td className="px-3 py-1.5">{r.name ?? '—'}</td>
                <td className="px-3 py-1.5">
                  {r.status === 'valid' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Valid</span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 ${r.status === 'duplicate' ? 'text-amber-700' : 'text-rose-700'}`}>
                      <AlertCircle className="h-3 w-3" /> {r.error}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.recipients.length > PREVIEW_ROWS && (
        <p className="text-[11px] text-slate-500">Showing the first {PREVIEW_ROWS} matching rows.</p>
      )}
    </div>
  );
}
