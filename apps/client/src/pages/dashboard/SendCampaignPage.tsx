import type { Audience, ParsePreviewResponse, ColumnMapping } from '@saas/shared';
import { Upload, Send, AlertCircle, CheckCircle2, FileText, Loader2, ChevronRight, ChevronLeft, Search, Check, X, Clock, Calendar, Sparkles, Table2, AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Copy, Hash, BarChart3, FileSpreadsheet, Paperclip, Code2, Laptop, Smartphone, FolderOpen, Tag, Eye, Layers } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, type FormEvent, type ChangeEvent } from 'react';
import ReactQuill from 'react-quill';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { fetchAudiences, fetchAudienceDetails } from '@/lib/audiences-api';
import { parseFilePreview, scheduleCampaign, sendCampaignNow } from '@/lib/campaigns-api';
import type { ScheduleResult, SendNowResult } from '@/lib/campaigns-api';
import { smtpApi } from '@/lib/smtp-api';
import { fetchTemplates } from '@/lib/templates-api';

import 'react-quill/dist/quill.snow.css';

// Configure Quill to use inline style attributes instead of class names for email HTML compatibility
const Quill = ReactQuill.Quill;
const AlignStyle = Quill.import('attributors/style/align');
const ColorStyle = Quill.import('attributors/style/color');
const BackgroundStyle = Quill.import('attributors/style/background');

Quill.register(AlignStyle, true);
Quill.register(ColorStyle, true);
Quill.register(BackgroundStyle, true);

type Step = 1 | 2 | 3 | 4 | 5;

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, 4, 5, 6, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ script: 'sub' }, { script: 'super' }],
    [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
    [{ align: [] }],
    ['link', 'image', 'video'],
    ['blockquote', 'code-block'],
    ['clean'],
  ],
};

const quillFormats = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'color', 'background',
  'script',
  'list', 'bullet', 'indent',
  'align',
  'link', 'image', 'video',
  'blockquote', 'code-block',
];

export function SendCampaignPage() {
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Refs for cursor insertion
  const subjectRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const quillRef = useRef<ReactQuill>(null);

  // Email Templates state
  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; body: string }[]>([]);

  // Load templates on component load
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await fetchTemplates();
        setTemplates(data);
      } catch (err) {
        toast.warning(`Saved templates could not be loaded: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    };
    loadTemplates();
  }, []);

  // Load SMTP settings to pre-fill fromName
  useEffect(() => {
    const loadSmtpSettings = async () => {
      try {
        const smtpSettings = await smtpApi.get();
        if (smtpSettings?.fromName) setFromName(smtpSettings.fromName);
        if (smtpSettings?.fromEmail) setSenderEmail(smtpSettings.fromEmail);
      } catch {
        // Only used to pre-fill the From Name; the server validates SMTP at send time
      }
    };
    loadSmtpSettings();
  }, []);

  const insertVariableIntoSubject = (variableName: string) => {
    const token = `{{${variableName}}}`;
    const input = subjectRef.current;
    if (input) {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const val = input.value;
      const newVal = val.substring(0, start) + token + val.substring(end);
      setSubject(newVal);
      // Refocus and place cursor after token
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      setSubject((prev) => prev + token);
    }
  };

  const insertVariableIntoBody = (variableName: string) => {
    const token = `{{${variableName}}}`;
    if (showQuill && quillRef.current) {
      const editor = quillRef.current.getEditor();
      const range = editor.getSelection(true);
      editor.insertText(range.index, token);
      editor.setSelection(range.index + token.length, 0);
    } else {
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? 0;
        const val = textarea.value;
        const newVal = val.substring(0, start) + token + val.substring(end);
        setBody(newVal);
        // Refocus and place cursor after token
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + token.length, start + token.length);
        }, 0);
      } else {
        setBody((prev) => prev + token);
      }
    }
  };

  // Form state
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [body, setBody] = useState('');
  const [showQuill, setShowQuill] = useState(true); // Default to visual WYSIWYG editor
  const [attachments, setAttachments] = useState<File[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // Compose UI view mode states
  const [composeView, setComposeView] = useState<'split' | 'editor' | 'preview'>('split');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showAttachments, setShowAttachments] = useState(false);

  // Audiences state
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string>('');

  useEffect(() => {
    fetchAudiences()
      .then(setAudiences)
      .catch((err) => toast.warning(`Saved audience lists could not be loaded: ${err instanceof Error ? err.message : 'unknown error'}`));
  }, []);

  // Preview state
  const [previewData, setPreviewData] = useState<ParsePreviewResponse | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [searchRecipients, setSearchRecipients] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [showColumnMappings, setShowColumnMappings] = useState(false);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const variables = previewData?.columns || ['email', 'name'];

  // Sending state
  const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);
  const [sendNowResult, setSendNowResult] = useState<SendNowResult | null>(null);
  const [sendingError, setSendingError] = useState('');

  const handleSelectAudience = async (audienceId: string) => {
    setSelectedAudienceId(audienceId);
    if (!audienceId) {
      setPreviewData(null);
      setCsvFile(null);
      return;
    }
    try {
      setIsParsing(true);
      const data = await fetchAudienceDetails(audienceId);
      const sendable = data.contacts.filter((c) => c.status === 'subscribed');
      const excluded = data.contacts.length - sendable.length;

      // Convert the list into a CSV and run it through the server preview, so
      // audience sends get exactly the same validation and de-duplication as uploads.
      const csvCell = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;
      const csvContent = 'email,name\n' + sendable.map((c) => `${csvCell(c.email)},${csvCell(c.name)}`).join('\n');
      const virtualFile = new File([csvContent], `${data.audience.name}.csv`, { type: 'text/csv' });
      setCsvFile(virtualFile);
      setPreviewPage(1);
      setShowDuplicatesOnly(false);
      setPreviewData(await parseFilePreview(virtualFile));
      if (excluded > 0) {
        toast.info(`${excluded} unsubscribed/bounced contact${excluded !== 1 ? 's' : ''} excluded from this send.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load audience contacts.');
    } finally {
      setIsParsing(false);
    }
  };

  // ── Step 1: Upload & Preview ──────────────────────────────────────────────
  const handleFile = async (file: File) => {
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validExtensions.includes(ext)) {
      toast.error('Please select a valid CSV or Excel (.xlsx, .xls) file.');
      return;
    }
    
    setCsvFile(file);
    setPreviewPage(1);
    setShowDuplicatesOnly(false);
    setSearchRecipients('');
    try {
      setIsParsing(true);
      const data = await parseFilePreview(file);
      setPreviewData(data);
      if (data.totalValid === 0) {
        toast.error('No valid emails found in the file.');
      } else {
        const skipped = data.duplicateCount + data.totalInvalid;
        toast.success(
          `${data.totalValid} unique valid recipient${data.totalValid !== 1 ? 's' : ''}` +
            (skipped > 0 ? ` · ${skipped} will be skipped (${data.totalInvalid} invalid, ${data.duplicateCount} duplicate)` : '')
        );
      }
      // Auto-show column mappings if any non-standard headers detected
      if (data.columnMappings?.some((m: ColumnMapping) => m.autoDetected && m.original !== m.mapped)) {
        setShowColumnMappings(true);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to parse file.';
      toast.error(msg);
      setCsvFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Preview helpers ──────────────────────────────────────────────────────
  const PREVIEW_PAGE_SIZE = 25;
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileTypeIcon = (type?: string) => {
    if (type === 'excel') return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    return <FileText className="w-5 h-5 text-indigo-600" />;
  };

  // ── Step 4: Send or Schedule Campaign ────────────────────────────────────
  const sendCampaign = async () => {
    if (!csvFile || !subject || !fromName || !body) return;

    // ── Scheduled path ────────────────────────────────────────────────────
    if (sendMode === 'scheduled') {
      if (!scheduledAt) {
        toast.error('Please pick a date and time to schedule this campaign.');
        return;
      }
      const scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
        toast.error('Scheduled time must be in the future.');
        return;
      }

      try {
        setCurrentStep(4); // show loading UI while saving
        const result = await scheduleCampaign(csvFile, {
          subject,
          fromName,
          body,
          scheduledAt: scheduledDate.toISOString(),
        }, attachments);
        setScheduleResult(result);
        setCurrentStep(5);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to schedule campaign.';
        setSendingError(msg);
        toast.error(msg);
        setCurrentStep(3);
      }
      return;
    }

    // ── Send now path (background) ──────────────────────────────────────
    try {
      setCurrentStep(4);
      setSendingError('');

      const sendResult = await sendCampaignNow(csvFile, {
        subject,
        fromName,
        body,
      }, attachments);

      setSendNowResult(sendResult);
      setCurrentStep(5);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initiate campaign.';
      setSendingError(msg);
      toast.error(msg);
      setCurrentStep(3);
    }
  };

  // ── Render Helpers ────────────────────────────────────────────────────────
  const renderStepper = () => {
    const steps = ['Upload CSV', 'Compose', 'Review', 'Send', 'Results'];
    
    return (
      <div className="mb-8 max-w-3xl mx-auto px-4">
        <div className="relative flex items-center justify-between pb-8">
          {/* Progress bar container: spans from center of first step (left-4) to center of last step (right-4) */}
          <div className="absolute left-4 right-4 top-4 -translate-y-1/2 h-0.5 bg-slate-200 -z-10">
            <div 
              className="h-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${((currentStep - 1) / 4) * 100}%` }}
            />
          </div>

          {steps.map((label, index) => {
            const stepNum = index + 1;
            const isActive = stepNum === currentStep;
            const isCompleted = stepNum < currentStep;
            
            return (
              <div key={label} className="relative flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors z-10 ${
                  isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' :
                  isCompleted ? 'bg-green-500 text-white' :
                  'bg-white border-2 border-slate-200 text-slate-400'
                }`}>
                  {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
                </div>
                <span className={`absolute top-10 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap hidden sm:inline-block ${
                  isActive ? 'text-indigo-600 font-bold' : 
                  isCompleted ? 'text-slate-900' : 
                  'text-slate-400'
                }`}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const filteredRecipients = useMemo(() => {
    let results = previewData?.recipients || [];
    
    // Filter by duplicates if toggled
    if (showDuplicatesOnly) {
      results = results.filter(r => r.status === 'duplicate');
    }
    
    // Filter by search
    if (searchRecipients) {
      const q = searchRecipients.toLowerCase();
      results = results.filter(r => 
        r.email.toLowerCase().includes(q) || 
        (r.name?.toLowerCase().includes(q)) ||
        Object.values(r).some(v => typeof v === 'string' && v.toLowerCase().includes(q))
      );
    }
    
    return results;
  }, [previewData, searchRecipients, showDuplicatesOnly]);

  const paginatedRecipients = useMemo(() => {
    const start = (previewPage - 1) * PREVIEW_PAGE_SIZE;
    return filteredRecipients.slice(start, start + PREVIEW_PAGE_SIZE);
  }, [filteredRecipients, previewPage]);

  const totalPreviewPages = Math.max(1, Math.ceil(filteredRecipients.length / PREVIEW_PAGE_SIZE));

  // Dynamic columns for the preview table (exclude internal fields)
  const previewColumns = useMemo(() => {
    if (!previewData?.columns) return ['email', 'name'];
    return previewData.columns;
  }, [previewData]);

  // Sample recipient for live preview tag substitution
  const sampleRecipient = useMemo<Record<string, any>>(() => {
    if (previewData?.recipients && previewData.recipients.length > 0) {
      const validFirst = previewData.recipients.find(r => r.valid) || previewData.recipients[0];
      if (validFirst) return validFirst;
    }
    return { email: 'alex.smith@example.com', name: 'Alex Smith' };
  }, [previewData]);

  const renderedPreviewSubject = useMemo(() => {
    if (!subject) return 'No subject';
    let res = subject;
    res = res.replace(/\{\{(\w+)\}\}/g, (_m, varName) => {
      const key = varName.toLowerCase();
      if (sampleRecipient && key in sampleRecipient && sampleRecipient[key]) {
        return String(sampleRecipient[key]);
      }
      return key === 'name' ? 'Alex' : `[${varName}]`;
    });
    return res;
  }, [subject, sampleRecipient]);

  const renderedPreviewBody = useMemo(() => {
    if (!body) return '<p class="text-slate-400 italic">Your email content will appear here...</p>';
    let res = body;
    res = res.replace(/\{\{(\w+)\}\}/g, (_m, varName) => {
      const key = varName.toLowerCase();
      if (sampleRecipient && key in sampleRecipient && sampleRecipient[key]) {
        return String(sampleRecipient[key]);
      }
      return key === 'name' ? 'Alex' : `[${varName}]`;
    });
    return res;
  }, [body, sampleRecipient]);

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Send Campaign</h1>
        <p className="mt-1 text-sm text-slate-500">Create and dispatch a new bulk email campaign in a few easy steps.</p>
      </div>

      {renderStepper()}

      <div className="relative overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        {/* STEP 1: Upload */}
        {currentStep === 1 && (
          <div className="p-6 animate-slide-right flex flex-col h-full space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Select Recipients List</h2>
              {audiences.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Select Saved List:</span>
                  <select
                    className="h-8 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                    value={selectedAudienceId}
                    onChange={(e) => handleSelectAudience(e.target.value)}
                  >
                    <option value="">-- Choose an Audience List --</option>
                    {audiences.map((aud) => (
                      <option key={aud.id} value={aud.id}>
                        {aud.name} ({aud.contactCount} contacts)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            {!previewData ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-all ${
                  isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                {isParsing ? (
                  <div className="flex flex-col items-center text-slate-500">
                    <div className="relative w-16 h-16 mb-4">
                      <div className="absolute inset-0 border-4 border-indigo-100 rounded-full" />
                      <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-indigo-600" />
                      </div>
                    </div>
                    <p className="font-medium text-slate-700">Analyzing your file...</p>
                    <p className="text-sm text-slate-400 mt-1">Detecting columns, validating emails, checking duplicates</p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                      <Upload className="h-8 w-8 text-indigo-600" />
                    </div>
                    <p className="text-base font-medium text-slate-700 mb-1">
                      Drag and drop your file here
                    </p>
                    <p className="text-sm text-slate-500 mb-1">Supports CSV, Excel (.xlsx, .xls)</p>
                    <p className="text-xs text-slate-400 mb-1">File is auto-analyzed on upload — no extra clicks needed</p>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs mb-6">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="font-medium">Supports multiple emails per row (comma-separated)</span>
                    </div>
                    <label className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors bg-indigo-600 text-white shadow hover:bg-indigo-700 active:bg-indigo-800 h-10 px-4 py-2 cursor-pointer select-none">
                      <span>Select File</span>
                      <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={handleFileChange} />
                    </label>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col h-full space-y-4 animate-fade-in">
                {/* ── File Info & Stats Bar ─────────────────────────────── */}
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                      {getFileTypeIcon(previewData.fileInfo?.type)}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{previewData.fileInfo?.name || csvFile?.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span>{previewData.fileInfo?.type === 'excel' ? 'Excel' : 'CSV'}</span>
                        <span className="text-slate-300">•</span>
                        <span>{formatFileSize(previewData.fileInfo?.size || csvFile?.size || 0)}</span>
                        <span className="text-slate-300">•</span>
                        <span>{previewData.fileInfo?.rowCount || previewData.recipients.length} rows</span>
                        <span className="text-slate-300">•</span>
                        <span>{previewData.columns?.length || 0} columns</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => { setPreviewData(null); setCsvFile(null); setShowColumnMappings(false); setShowDuplicatesOnly(false); }}>
                    Change File
                  </Button>
                </div>

                {/* ── Stats Cards ───────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { 
                      label: 'Total Rows', 
                      value: previewData.fileInfo?.rowCount || previewData.recipients.length, 
                      icon: Hash, 
                      color: 'text-slate-700 bg-slate-50 border-slate-200',
                      description: 'CSV/Excel rows uploaded'
                    },
                    { 
                      label: 'Will Be Sent',
                      value: previewData.totalValid,
                      icon: CheckCircle2,
                      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                      description: 'Unique valid addresses'
                    },
                    { 
                      label: 'Invalid', 
                      value: previewData.totalInvalid, 
                      icon: AlertCircle, 
                      color: 'text-red-700 bg-red-50 border-red-200',
                      description: 'Missing or malformed — skipped'
                    },
                    { 
                      label: 'Duplicates', 
                      value: previewData.duplicateCount || 0, 
                      icon: Copy, 
                      color: 'text-amber-700 bg-amber-50 border-amber-200',
                      description: 'Repeats — skipped (sent once)',
                      clickable: (previewData.duplicateCount || 0) > 0
                    },
                  ].map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                      <div 
                        key={stat.label} 
                        className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${stat.color} animate-scale-in transition-all ${
                          stat.clickable ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
                        }`}
                        style={{ animationDelay: `${idx * 0.07}s` }}
                        onClick={() => {
                          if (stat.clickable) {
                            setShowDuplicatesOnly(!showDuplicatesOnly);
                            setPreviewPage(1);
                          }
                        }}
                        title={stat.clickable ? 'Click to filter duplicates' : stat.description}
                      >
                        <div className={`p-2 rounded-lg ${
                          stat.label === 'Will Be Sent' ? 'bg-emerald-100' :
                          stat.label === 'Invalid' ? 'bg-red-100' :
                          stat.label === 'Duplicates' ? 'bg-amber-100' :
                          'bg-slate-100'
                        }`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-2xl font-bold leading-none mb-1">{stat.value}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{stat.label}</p>
                          <p className="text-[10px] mt-1 opacity-60 leading-tight">{stat.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Duplicate Warning ─────────────────────────────────── */}
                {(previewData.duplicateCount || 0) > 0 && (
                  <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs animate-fade-in">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold mb-0.5">
                        {previewData.duplicateCount} duplicate email{previewData.duplicateCount !== 1 ? 's' : ''} detected
                      </p>
                      <p className="text-amber-800 opacity-90">
                        Each address receives this campaign only once (matching ignores upper/lower case and spaces).
                        Repeated rows are skipped — the first occurrence is used.
                      </p>
                      {previewData.duplicates.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-amber-900">
                          {previewData.duplicates.slice(0, 5).map((d) => (
                            <li key={`${d.rowNumber}-${d.email}`}>
                              Row {d.rowNumber}: {d.email} — duplicate of row {d.firstSeenRow}
                            </li>
                          ))}
                          {previewData.duplicates.length > 5 && <li>…and {previewData.duplicates.length - 5} more</li>}
                        </ul>
                      )}
                    </div>
                    <button 
                      type="button"
                      onClick={() => { setShowDuplicatesOnly(!showDuplicatesOnly); setPreviewPage(1); }}
                      className="ml-auto text-amber-700 font-semibold hover:text-amber-900 underline underline-offset-2 whitespace-nowrap hover:bg-amber-100 px-2 py-1 rounded transition-colors"
                    >
                      {showDuplicatesOnly ? 'Show All' : 'View Duplicates'}
                    </button>
                  </div>
                )}

                {/* ── Multiple Emails Info ──────────────────────────────── */}
                {new Set(previewData.recipients.map(r => r.rowNumber)).size < previewData.recipients.length && (
                  <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs animate-fade-in">
                    <Layers className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold mb-0.5">
                        Multiple emails detected in some rows
                      </p>
                      <p className="text-blue-800 opacity-90">
                        Rows with comma-separated emails (e.g., "email1@domain.com, email2@domain.com") will send to all valid addresses. Each email is validated separately and shown as a separate recipient below.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Column Mapping Panel ──────────────────────────────── */}
                {previewData.columnMappings && previewData.columnMappings.length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowColumnMappings(!showColumnMappings)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Table2 className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm font-medium text-slate-700">Column Mappings</span>
                        {previewData.columnMappings.some((m: ColumnMapping) => m.autoDetected && m.original !== m.mapped) && (
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">AUTO-DETECTED</span>
                        )}
                      </div>
                      {showColumnMappings ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>
                    {showColumnMappings && (
                      <div className="p-3 bg-white border-t border-slate-100 animate-expand">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {previewData.columnMappings.map((mapping: ColumnMapping, idx: number) => (
                            <div 
                              key={idx} 
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border ${
                                mapping.autoDetected && mapping.original !== mapping.mapped
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                  : 'bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              <span className="font-mono truncate">{mapping.original}</span>
                              {mapping.autoDetected && mapping.original !== mapping.mapped && (
                                <>
                                  <ArrowRight className="w-3 h-3 shrink-0 text-indigo-400" />
                                  <span className="font-semibold text-indigo-700">{mapping.mapped}</span>
                                </>
                              )}
                              {mapping.autoDetected && mapping.original !== mapping.mapped && (
                                <Check className="w-3 h-3 text-indigo-500 shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Search & Filter Bar ───────────────────────────────── */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input 
                      placeholder="Search across all columns..." 
                      className="pl-9 h-9"
                      value={searchRecipients}
                      onChange={(e) => { setSearchRecipients(e.target.value); setPreviewPage(1); }}
                    />
                  </div>
                  {showDuplicatesOnly && (
                    <button
                      type="button"
                      onClick={() => { setShowDuplicatesOnly(false); setPreviewPage(1); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                      Duplicates Only
                      <X className="w-3 h-3 ml-1" />
                    </button>
                  )}
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {filteredRecipients.length} result{filteredRecipients.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* ── Dynamic Preview Table ─────────────────────────────── */}
                <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 flex flex-col max-h-[450px]">
                  <div className="overflow-x-auto overflow-y-auto flex-1">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
                        <tr>
                          <th className="px-3 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide w-12" title="Row number in your file">Row</th>
                          {previewColumns.map(col => (
                            <th key={col} className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap">
                              {col.replace(/_/g, ' ')}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-center font-semibold text-slate-600 text-xs uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {paginatedRecipients.map((r, i) => {
                          const isDuplicate = r.status === 'duplicate';
                          const isInvalid = r.status === 'invalid';
                          
                          return (
                            <tr 
                              key={`${r.rowNumber}-${r.email}-${i}`}
                              className={`animate-row-intransition-all hover:bg-slate-50 ${
                                isInvalid ? 'bg-red-50/40' : 
                                isDuplicate ? 'bg-amber-50/40' : ''
                              }`}
                              style={{ animationDelay: `${i * 0.02}s` }}
                            >
                              <td className="px-3 py-3 text-slate-400 text-xs font-medium">{r.rowNumber}</td>
                              {previewColumns.map(col => {
                                const value = r[col];
                                const displayValue = value ? String(value) : '—';
                                
                                return (
                                  <td key={col} className="px-4 py-3 text-slate-700" title={displayValue}>
                                    {col === 'email' ? (
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-900 truncate max-w-[280px]">
                                          {r.email || '—'}
                                        </span>

                                      </div>
                                    ) : col === 'name' ? (
                                      <span className="text-slate-600 truncate block max-w-[200px]">{displayValue}</span>
                                    ) : col.toLowerCase().includes('email') ? (
                                      <span className="font-mono text-xs text-slate-600 truncate block max-w-[200px]">{displayValue}</span>
                                    ) : (
                                      <span className="text-slate-600 truncate block max-w-[200px]">{displayValue}</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-3 text-center">
                                {r.status === 'valid' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Valid
                                  </span>
                                ) : isDuplicate ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold" title={`Skipped — ${r.error ?? 'duplicate'}`}>
                                    <Copy className="w-3.5 h-3.5" />
                                    Skipped: {r.error ?? 'Duplicate'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-semibold" title={r.error}>
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    {r.error || 'Invalid'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {paginatedRecipients.length === 0 && (
                          <tr>
                            <td colSpan={previewColumns.length + 2} className="px-4 py-12 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <Search className="w-8 h-8 text-slate-300" />
                                <p className="text-slate-400 text-sm font-medium">No results found</p>
                                <p className="text-slate-400 text-xs">Try adjusting your search or filters</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Pagination ────────────────────────────────────────── */}
                  {totalPreviewPages > 1 && (
                    <div className="bg-slate-50 py-2 px-4 flex items-center justify-between border-t border-slate-200 text-xs">
                      <span className="text-slate-500">
                        Showing {((previewPage - 1) * PREVIEW_PAGE_SIZE) + 1}–{Math.min(previewPage * PREVIEW_PAGE_SIZE, filteredRecipients.length)} of {filteredRecipients.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={previewPage <= 1}
                          onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                          className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4 text-slate-600" />
                        </button>
                        {Array.from({ length: Math.min(5, totalPreviewPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalPreviewPages <= 5) {
                            pageNum = i + 1;
                          } else if (previewPage <= 3) {
                            pageNum = i + 1;
                          } else if (previewPage >= totalPreviewPages - 2) {
                            pageNum = totalPreviewPages - 4 + i;
                          } else {
                            pageNum = previewPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setPreviewPage(pageNum)}
                              className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                                previewPage === pageNum 
                                  ? 'bg-indigo-600 text-white' 
                                  : 'text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          disabled={previewPage >= totalPreviewPages}
                          onClick={() => setPreviewPage(p => Math.min(totalPreviewPages, p + 1))}
                          className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight className="w-4 h-4 text-slate-600" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="mt-auto pt-6 flex justify-end">
              <Button 
                onClick={() => setCurrentStep(2)} 
                disabled={!previewData || previewData.totalValid === 0}
                className={previewData && previewData.totalValid > 0 ? 'animate-cta-pulse' : ''}
              >
                Next Step
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Compose Email */}
        {currentStep === 2 && (
          <div className="p-6 animate-slide-right flex flex-col h-full space-y-4">
            {/* ── Top Header & Actions Bar ──────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">Compose Campaign Email</h2>
                  <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-full">
                    👥 {previewData?.totalValid || 0} Recipients
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Design your content with personalized merge tags and instant live preview.
                </p>
              </div>

              {/* Toolbar Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Saved Template Selector */}
                {templates.length > 0 && (
                  <div className="relative">
                    <select
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        if (!selectedId) return;
                        const template = templates.find((t) => t.id === selectedId);
                        if (template) {
                          setSubject(template.subject);
                          setBody(template.body);
                          toast.success(`Loaded template: "${template.name}"`);
                          e.target.value = '';
                        }
                      }}
                      className="h-8 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
                      defaultValue=""
                    >
                      <option value="" disabled>📂 Load Template...</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Editor / Source Toggle */}
                <button
                  type="button"
                  onClick={() => setShowQuill(!showQuill)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    showQuill
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  }`}
                  title={showQuill ? 'Switch to Raw HTML editor' : 'Switch to Visual WYSIWYG editor'}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  {showQuill ? 'Visual Editor' : 'HTML Source'}
                </button>

                {/* View Switcher: Editor / Split / Preview */}
                <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setComposeView('editor')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      composeView === 'editor'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposeView('split')}
                    className={`px-2.5 py-1 rounded-md transition-all hidden lg:block ${
                      composeView === 'split'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Split View
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposeView('preview')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      composeView === 'preview'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Preview
                  </button>
                </div>
              </div>
            </div>

            {/* ── Envelope Header Fields (Sender & Subject) ─────────────── */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-4 space-y-3 shadow-xs">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <label className="md:col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  From Name:
                </label>
                <div className="md:col-span-10">
                  <Input
                    placeholder="e.g., Acme Team or Marketing Department"
                    className="h-9 bg-white text-sm"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <label className="md:col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Subject Line:
                </label>
                <div className="md:col-span-10">
                  <Input
                    ref={subjectRef}
                    placeholder="e.g., Special Announcement for {{name}}"
                    className="h-9 bg-white text-sm font-medium"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
              </div>

              {/* Merge Tags Ribbon */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 overflow-x-auto text-xs">
                <div className="flex items-center gap-1 text-slate-400 font-bold text-[10px] uppercase tracking-wider shrink-0">
                  <Tag className="w-3 h-3 text-indigo-500" />
                  <span>Insert Tag:</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {variables.map((col) => (
                    <button
                      key={`tag-${col}`}
                      type="button"
                      onClick={() => insertVariableIntoBody(col)}
                      className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 text-slate-700 px-2 py-0.5 text-xs font-semibold hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all shadow-xs cursor-pointer select-none"
                      title={`Click to insert {{${col}}} at cursor in email body`}
                    >
                      <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
                      <span>{`{{${col}}}`}</span>
                    </button>
                  ))}
                  <span className="text-[10px] text-slate-400 italic">
                    (Inserts into body at cursor)
                  </span>
                </div>
              </div>
            </div>

            {/* ── Main Composer & Preview Workspace ──────────────────────── */}
            <div className="flex-1 min-h-0 grid gap-6 grid-cols-1 lg:grid-cols-12">
              {/* Left: Editor Pane */}
              {(composeView === 'editor' || composeView === 'split') && (
                <div className={`${composeView === 'split' ? 'lg:col-span-7' : 'lg:col-span-12'} flex flex-col min-h-[380px] space-y-3`}>
                  <div className="flex-1 flex flex-col rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                    {showQuill ? (
                      <ReactQuill
                        ref={quillRef}
                        theme="snow"
                        value={body}
                        onChange={setBody}
                        modules={quillModules}
                        formats={quillFormats}
                        placeholder="Write your email content here... Use bold, colors, links, lists, and merge tags like {{name}}."
                        className="quill-editor flex-1 flex flex-col h-full min-h-[300px]"
                      />
                    ) : (
                      <textarea
                        ref={textareaRef}
                        className="flex-1 min-h-[300px] w-full p-4 text-xs font-mono text-slate-800 bg-slate-900/5 focus:outline-none resize-none leading-relaxed"
                        placeholder="<h2>Hello {{name}},</h2><p>Your custom HTML goes here...</p>"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    )}
                  </div>

                  {/* Collapsible Attachments Bar */}
                  <div className="border border-slate-200 rounded-xl bg-slate-50/70 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4 text-slate-500" />
                        <span className="text-xs font-semibold text-slate-700">
                          Attachments ({attachments.length}/5)
                        </span>
                        <span className="text-[10px] text-slate-400">Max 5MB each</span>
                      </div>
                      <label className="inline-flex items-center gap-1 rounded-md text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2.5 py-1 cursor-pointer select-none shadow-xs">
                        <span>+ Add File</span>
                        <input
                          type="file"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            const validFiles = files.filter(file => {
                              if (file.size > 5 * 1024 * 1024) {
                                toast.error(`File "${file.name}" exceeds 5MB limit.`);
                                return false;
                              }
                              return true;
                            });
                            setAttachments(prev => {
                              const combined = [...prev, ...validFiles];
                              if (combined.length > 5) {
                                toast.error("Maximum 5 attachments allowed.");
                                return combined.slice(0, 5);
                              }
                              return combined;
                            });
                          }}
                        />
                      </label>
                    </div>

                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200/50">
                        {attachments.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
                            <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span className="truncate max-w-[140px] font-medium text-slate-800" title={file.name}>
                              {file.name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ({Math.round(file.size / 1024)} KB)
                            </span>
                            <button
                              type="button"
                              onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Right: Live Preview Panel */}
              {(composeView === 'preview' || composeView === 'split') && (
                <div className={`${composeView === 'split' ? 'lg:col-span-5' : 'lg:col-span-12 max-w-2xl mx-auto w-full'} flex flex-col min-h-[380px]`}>
                  <div className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-slate-100/70 overflow-hidden shadow-xs">
                    {/* Mock Email Client Header */}
                    <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
                        </div>
                        <span className="font-semibold text-slate-300 ml-1">Live Inbox Preview</span>
                      </div>

                      {/* Device Viewport Toggle */}
                      <div className="flex items-center gap-1 bg-slate-900/60 p-0.5 rounded-md text-[11px]">
                        <button
                          type="button"
                          onClick={() => setPreviewDevice('desktop')}
                          className={`px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
                            previewDevice === 'desktop' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Laptop className="w-3 h-3" />
                          Desktop
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewDevice('mobile')}
                          className={`px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
                            previewDevice === 'mobile' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Smartphone className="w-3 h-3" />
                          Mobile
                        </button>
                      </div>
                    </div>

                    {/* Email Headers Meta */}
                    <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-slate-400 w-12 shrink-0">Subject:</span>
                        <span className="font-bold text-slate-900 truncate">
                          {renderedPreviewSubject}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-slate-400 w-12 shrink-0">From:</span>
                        <span className="text-slate-700 truncate">
                          <strong>{fromName || 'Your Name'}</strong> &lt;{senderEmail || 'system default sender'}&gt;
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-slate-400 w-12 shrink-0">To:</span>
                        <span className="text-slate-500 truncate">
                          {sampleRecipient?.['name'] ? `${sampleRecipient['name']} <${sampleRecipient['email']}>` : (sampleRecipient?.['email'] || 'recipient@example.com')}
                        </span>
                      </div>
                    </div>

                    {/* Rendered Email Body with Personalized Variables */}
                    <div className="flex-1 bg-slate-50 p-4 overflow-y-auto max-h-[420px] flex justify-center">
                      <div className={`bg-white rounded-lg p-5 shadow-xs border border-slate-200/80 transition-all ${
                        previewDevice === 'mobile' ? 'w-[320px] text-xs' : 'w-full text-sm'
                      }`}>
                        <div 
                          className="prose prose-sm max-w-none text-slate-800 break-words"
                          dangerouslySetInnerHTML={{ __html: renderedPreviewBody }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Step 2 Footer Navigation ──────────────────────────────── */}
            <div className="mt-auto pt-4 flex justify-between items-center border-t border-slate-100">
              <Button variant="secondary" onClick={() => setCurrentStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={() => setCurrentStep(3)}
                disabled={!subject.trim() || !fromName.trim() || !body.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 shadow-sm"
              >
                Next Step: Review & Confirm
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Review & Confirm */}
        {currentStep === 3 && (
          <div className="p-6 animate-slide-right flex flex-col h-full">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Review & Confirm</h2>
            
            <div className="space-y-6 flex-1">
              <Alert variant="info" className="bg-indigo-50 text-indigo-800 border-indigo-200">
                <AlertCircle className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="font-semibold text-indigo-900">Ready to send</p>
                  <p className="text-sm">
                    You are about to send this campaign to <strong>{previewData?.totalValid}</strong> unique valid recipients.
                    {((previewData?.totalInvalid ?? 0) + (previewData?.duplicateCount ?? 0)) > 0 && (
                      <> {previewData?.totalInvalid} invalid and {previewData?.duplicateCount} duplicate row(s) will be skipped.</>
                    )}
                  </p>
                </div>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-sm">
                  <CardHeader className="py-4 border-b border-slate-100">
                    <CardTitle className="text-sm">Campaign Details</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-500">Subject:</span>
                      <span className="col-span-2 font-medium text-slate-900">{subject}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-500">From Name:</span>
                      <span className="col-span-2 font-medium text-slate-900">{fromName}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-500">Recipients:</span>
                      <span className="col-span-2 font-medium text-slate-900">{previewData?.totalValid} emails</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-500">Attachments:</span>
                      <span className="col-span-2 font-medium text-indigo-600 font-semibold">
                        {attachments.length > 0 ? (
                          <span>
                            {attachments.length} file(s) ({attachments.map(a => a.name).join(', ')})
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">None</span>
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="py-4 border-b border-slate-100">
                    <CardTitle className="text-sm">Sample Recipients</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-slate-100 text-sm">
                      {previewData?.recipients.filter(r => r.valid).slice(0, 3).map((r, i) => (
                        <li key={i} className="px-4 py-2.5 flex justify-between">
                          <span className="font-medium text-slate-900">{r.email}</span>
                          <span className="text-slate-500">{r.name || '—'}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="mt-6 flex justify-between items-center pt-4 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setCurrentStep(2)}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>

              <div className="flex flex-col items-end gap-3">
                {/* Send mode toggle */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSendMode('now')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      sendMode === 'now'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendMode('scheduled')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      sendMode === 'scheduled'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Schedule
                  </button>
                </div>

                {/* Datetime picker (only shown when scheduling) */}
                {sendMode === 'scheduled' && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                )}

                <Button
                  onClick={sendCampaign}
                  className={sendMode === 'scheduled' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-indigo-600 hover:bg-indigo-700'}
                  disabled={sendMode === 'scheduled' && !scheduledAt}
                >
                  {sendMode === 'scheduled' ? (
                    <><Clock className="w-4 h-4 mr-2" />Schedule Campaign</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" />Send Campaign Now</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Sending Progress (send-now mode) or Saving (schedule mode) */}
        {currentStep === 4 && (
          <div className="p-12 animate-fade-in flex flex-col items-center h-full">
            <div className="max-w-md w-full space-y-8 text-center">
              <div>
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 border-4 border-indigo-100 rounded-full" />
                  <div 
                    className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin" 
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    {sendMode === 'scheduled'
                      ? <Clock className="w-8 h-8 text-indigo-600" />
                      : <Send className="w-8 h-8 text-indigo-600 translate-x-0.5" />}
                  </div>
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  {sendMode === 'scheduled' ? 'Saving Schedule...' : 'Sending Campaign...'}
                </h2>
                <p className="text-slate-500 mt-2">
                  {sendMode === 'scheduled' ? 'Your campaign is being saved.' : 'This only takes a moment.'}
                </p>
              </div>

              {sendMode === 'now' && (
                <p className="text-sm text-slate-500">Validating recipients and queueing the campaign…</p>
              )}

              {sendingError && (
                <Alert variant="error" className="text-left">{sendingError}</Alert>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: Results — scheduled variant */}
        {currentStep === 5 && scheduleResult && (
          <div className="p-8 animate-fade-in flex flex-col h-full">
            <div className="text-center max-w-lg mx-auto mb-8">
              <div className="w-20 h-20 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-10 h-10 text-violet-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Campaign Scheduled!</h2>
              <p className="text-slate-500 mt-2">Your email campaign has been saved and will be sent automatically by the cron job.</p>
              {(scheduleResult.skipped.invalid + scheduleResult.skipped.duplicates) > 0 && (
                <p className="text-xs text-amber-700 mt-2">
                  Skipped before scheduling: {scheduleResult.skipped.invalid} invalid, {scheduleResult.skipped.duplicates} duplicate.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card className="bg-violet-50/50 border-violet-200 shadow-none">
                <CardContent className="p-6 text-center">
                  <p className="text-sm font-medium text-violet-600 mb-1">Recipients</p>
                  <p className="text-3xl font-bold text-violet-700">{scheduleResult.recipientCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-50/50 border-slate-200 shadow-none md:col-span-2">
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-slate-500 mb-2">Scheduled Send Time</p>
                  <p className="text-lg font-bold text-slate-900">
                    {new Date(scheduleResult.scheduledAt).toLocaleString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">The cron job checks every minute and will fire this campaign when the time arrives.</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-center gap-4 mt-auto">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Schedule Another
              </Button>
              <Button
                className="bg-violet-600 hover:bg-violet-700"
                onClick={() => window.location.href = `/dashboard/campaigns/${scheduleResult.campaignId}`}
              >
                View Campaign
              </Button>
            </div>
          </div>
        )}

        {/* STEP 5: Results — send-now variant (background) */}
        {currentStep === 5 && sendNowResult && (
          <div className="p-8 animate-fade-in flex flex-col h-full space-y-6">
            <div className="text-center max-w-lg mx-auto">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Campaign Queued</h2>
              <p className="text-slate-500 mt-2">
                Sending runs on the server — you can safely navigate away. The campaign page shows each recipient's result
                as it happens, including any SMTP errors.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-indigo-50/50 border-indigo-200 shadow-none">
                <CardContent className="p-5 text-center">
                  <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Recipients Queued</p>
                  <p className="text-3xl font-bold text-indigo-700">{sendNowResult.recipientCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-emerald-50/50 border-emerald-200 shadow-none">
                <CardContent className="p-5 text-center">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-lg font-bold text-emerald-700">Queued for sending</p>
                  <p className="text-[11px] text-emerald-600/80 mt-0.5">Not yet confirmed — see campaign page</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-50/50 border-slate-200 shadow-none">
                <CardContent className="p-5 text-center">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Skipped by Server</p>
                  <p className="text-2xl font-bold text-slate-700">{sendNowResult.skipped.invalid + sendNowResult.skipped.duplicates}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {sendNowResult.skipped.invalid} invalid · {sendNowResult.skipped.duplicates} duplicate
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* If invalid emails were present in preview */}
            {((previewData?.totalInvalid || 0) + (previewData?.duplicateCount || 0)) > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-900">
                      {(previewData?.totalInvalid || 0) + (previewData?.duplicateCount || 0)} row(s) skipped from the source file (invalid or duplicate)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const invalidList = previewData?.recipients.filter(r => !r.valid).map(r => `Row ${r.rowNumber}: ${r.email || '(empty)'} (${r.error || 'invalid'})`).join('\n') || '';
                      navigator.clipboard.writeText(invalidList);
                      toast.success('Copied skipped emails list to clipboard!');
                    }}
                    className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline cursor-pointer"
                  >
                    Copy Skipped List
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-4 mt-auto pt-4">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Send Another
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => window.location.href = `/dashboard/campaigns/${sendNowResult.campaignId}`}
              >
                View Campaign Summary & Recipient Status
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
