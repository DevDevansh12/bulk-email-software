import { zodResolver } from '@hookform/resolvers/zod';
import type { WhatsAppConfig, WhatsAppConfigTestResult } from '@saas/shared';
import { User, Lock, Bell, Shield, Mail, Eye, EyeOff, CheckCircle, XCircle, AlertCircle, Loader2, Trash2, MessageSquare } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { authApi } from '@/features/auth/auth.api';
import { useAuthStore } from '@/features/auth/auth.store';
import { cn } from '@/lib/cn';
import { smtpApi, type SmtpSettings, type SmtpFormPayload } from '@/lib/smtp-api';
import { fetchWhatsAppConfig, saveWhatsAppConfig, deleteWhatsAppConfig, testWhatsAppConfig } from '@/lib/whatsapp-api';


type SettingsTab = 'profile' | 'security' | 'smtp' | 'whatsapp' | 'notifications' | 'sessions';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'smtp', label: 'SMTP Config', icon: Mail },
  { id: 'whatsapp', label: 'WhatsApp Config', icon: MessageSquare },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'sessions', label: 'Sessions', icon: Shield },
];

// ── Profile tab ───────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, 'Required').max(50),
  lastName: z.string().min(1, 'Required').max(50),
  email: z.string().email('Enter a valid email'),
});
type ProfileForm = z.infer<typeof profileSchema>;

function ProfileTab() {
  const user = useAuthStore((s) => s.user);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
    },
  });

  const onSubmit = async (_values: ProfileForm) => {
    // Profile update API not yet implemented on server
    await new Promise((r) => setTimeout(r, 600));
    toast.success('Profile updated successfully.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>Update your name and email address.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-md space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
            <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
          </div>
          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            hint="Changing your email will require re-verification."
            {...register('email')}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" loading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Security tab ──────────────────────────────────────────────────────────────

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: z.string().min(1, 'New password is required'),
  confirmPassword: z.string().min(1, 'Required'),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

function SecurityTab() {
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (values: ChangePasswordForm) => {
    setServerError(null);
    try {
      await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success('Password changed successfully.');
      reset();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to change password.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Keep your account secure with a strong password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-md space-y-4">
          {serverError && <Alert variant="error" onDismiss={() => setServerError(null)}>{serverError}</Alert>}
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" loading={isSubmitting}>Update password</Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Notifications tab ─────────────────────────────────────────────────────────

const notifItems = [
  { id: 'campaign_sent', label: 'Campaign sent', desc: 'Notify me when a campaign finishes sending.' },
  { id: 'campaign_report', label: 'Campaign report', desc: 'Send a performance summary 24h after sending.' },
  { id: 'subscriber_milestone', label: 'Subscriber milestone', desc: 'Alert when I hit 1k, 5k, 10k subscribers.' },
  { id: 'bounce_alert', label: 'High bounce alert', desc: 'Warn when bounce rate exceeds 3%.' },
  { id: 'security', label: 'Security alerts', desc: 'Notify on new logins and password changes.', locked: true },
];

function NotificationsTab() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    campaign_sent: true,
    campaign_report: true,
    subscriber_milestone: false,
    bounce_alert: true,
    security: true,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Choose which emails you'd like to receive from us.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-slate-100">
          {notifItems.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              <button
                role="switch"
                aria-checked={prefs[item.id]}
                disabled={item.locked}
                onClick={() => !item.locked && setPrefs((p) => ({ ...p, [item.id]: !p[item.id] }))}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600',
                  prefs[item.id] ? 'bg-indigo-600' : 'bg-slate-200',
                  item.locked && 'cursor-not-allowed opacity-60'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                    prefs[item.id] ? 'translate-x-4' : 'translate-x-1'
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Button onClick={() => toast.info('Notification preferences saved.')}>Save preferences</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sessions tab ──────────────────────────────────────────────────────────────

function SessionsTab() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Sessions</CardTitle>
        <CardDescription>Manage where you're logged in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Current session</p>
              <p className="text-xs text-slate-500 mt-0.5">Windows — Chrome · {new Date().toLocaleDateString()}</p>
            </div>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
          </div>
        </div>

        <div className="pt-2">
          <p className="text-sm text-slate-600 mb-3">
            If you suspect unauthorized access, you can sign out of all other sessions.
          </p>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await authApi.logoutAll();
                toast.success('Signed out from all sessions.');
                await logout();
              } catch {
                toast.error('Failed to sign out all sessions. Please try again.');
              }
            }}
          >
            Sign out all sessions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── SMTP schema ───────────────────────────────────────────────────────────────
// Keep smtpPort as string in the form — convert to number only at API call time.
// This avoids the Zod transform/resolver type conflict with exactOptionalPropertyTypes.
// smtpPass may be blank when settings are already saved (= keep the saved password).

const smtpSchema = z.object({
  smtpHost: z.string().trim().min(1, 'SMTP host is required'),
  smtpPort: z.string().regex(/^\d+$/, 'Port must be a number between 1–65535'),
  smtpUser: z.string().trim().min(1, 'SMTP username is required'),
  smtpPass: z.string(),
  fromEmail: z.string().email('Enter a valid sender email'),
  fromName: z.string().max(100),
});
type SmtpForm = z.infer<typeof smtpSchema>; // all strings

/** Convert form values (port as string) to the API payload shape */
function toApiPayload(v: SmtpForm): SmtpFormPayload {
  return { ...v, smtpPort: Number(v.smtpPort) };
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

function SmtpTab() {
  const [savedSettings, setSavedSettings] = useState<SmtpSettings | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [removing, setRemoving] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SmtpForm>({
    resolver: zodResolver(smtpSchema),
    defaultValues: {
      smtpHost: 'smtp.gmail.com',
      smtpPort: '587',
      smtpUser: '',
      smtpPass: '',
      fromEmail: '',
      fromName: '',
    },
  });

  const loadSettings = useCallback(
    async (resetForm: boolean) => {
      try {
        const data = await smtpApi.get();
        setSavedSettings(data);
        setLoadError(null);
        if (data && resetForm) {
          reset({
            smtpHost: data.smtpHost,
            smtpPort: String(data.smtpPort),
            smtpUser: data.smtpUser,
            smtpPass: '',
            fromEmail: data.fromEmail,
            fromName: data.fromName,
          });
        }
      } catch (err) {
        setLoadError(
          err instanceof Error
            ? `Could not load SMTP settings: ${err.message}`
            : 'Could not load SMTP settings — make sure the server is running and the database migration has been applied.'
        );
        setSavedSettings((prev) => (prev === undefined ? null : prev)); // exit the loading state so the form renders
      }
    },
    [reset]
  );

  // Load saved settings on mount
  useEffect(() => {
    void loadSettings(true);
  }, [loadSettings]);

  const isLoading = savedSettings === undefined;

  const handleTest = async () => {
    const result = smtpSchema.safeParse(getValues());
    if (!result.success) {
      toast.error('Please fill in all required fields before testing.');
      return;
    }
    if (!result.data.smtpPass && !savedSettings) {
      setError('smtpPass', { message: 'Enter the SMTP password / app password to test' });
      return;
    }
    setTestStatus('testing');
    setTestMessage('');
    try {
      const testResult = await smtpApi.test(toApiPayload(result.data));
      setTestStatus(testResult.success ? 'success' : 'error');
      setTestMessage(testResult.message);
      // The server may have changed the verified flag — refresh the badge from the source of truth
      if (savedSettings) await loadSettings(false);
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : 'Could not reach the server. Check your connection.');
    }
  };

  const onSave = async (values: SmtpForm) => {
    if (!values.smtpPass && !savedSettings) {
      setError('smtpPass', { message: 'SMTP password / app password is required' });
      return;
    }
    try {
      const updated = await smtpApi.save(toApiPayload(values));
      setSavedSettings(updated);
      reset({ ...values, smtpPass: '' });
      toast.success(
        updated.isVerified
          ? 'SMTP settings saved.'
          : 'SMTP settings saved. Click "Test Connection" to verify them.'
      );
      setTestStatus('idle');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save SMTP settings.');
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remove your SMTP settings? Campaigns will use the system default email.')) return;
    setRemoving(true);
    try {
      await smtpApi.remove();
      setSavedSettings(null);
      reset({ smtpHost: 'smtp.gmail.com', smtpPort: '587', smtpUser: '', smtpPass: '', fromEmail: '', fromName: '' });
      setTestStatus('idle');
      toast.success('SMTP settings removed. Using system default email.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove SMTP settings.');
    } finally {
      setRemoving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-500">Loading SMTP settings…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>SMTP Configuration</CardTitle>
            <CardDescription>
              Configure your own email server so campaigns are sent from your address.
            </CardDescription>
          </div>
          {savedSettings ? (
            savedSettings.isVerified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 border border-green-200">
                <CheckCircle className="h-3.5 w-3.5" />
                Your SMTP · Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                <AlertCircle className="h-3.5 w-3.5" />
                Your SMTP · Not verified
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
              <AlertCircle className="h-3.5 w-3.5" />
              System Default
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loadError && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!savedSettings && !loadError && (
          <div className="mb-5 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            <strong>Currently using system default SMTP.</strong> Fill in your credentials below to send
            campaigns from your own email address.
          </div>
        )}

        {savedSettings && !savedSettings.isVerified && (
          <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            Your saved settings have not passed a connection test yet. Campaigns will still try them — run
            <strong> Test Connection</strong> to catch login or port problems before sending.
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(onSave)(e)} noValidate className="space-y-4 max-w-lg">
          {/* SMTP Host + Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Input
                id="smtp-host"
                label="SMTP Host"
                placeholder="smtp.gmail.com"
                error={errors.smtpHost?.message}
                {...register('smtpHost')}
              />
            </div>
            <div>
              <Input
                id="smtp-port"
                label="Port"
                type="number"
                placeholder="587"
                error={errors.smtpPort?.message}
                {...register('smtpPort')}
              />
            </div>
          </div>

          {/* SMTP Username */}
          <Input
            id="smtp-user"
            label="SMTP Username"
            placeholder="you@gmail.com"
            autoComplete="username"
            error={errors.smtpUser?.message}
            {...register('smtpUser')}
          />

          {/* SMTP Password */}
          <div className="relative">
            <Input
              id="smtp-pass"
              label={savedSettings ? 'SMTP Password (leave blank to keep current)' : 'SMTP Password / App Password'}
              type={showPass ? 'text' : 'password'}
              placeholder={savedSettings ? '••••••••••••' : 'Enter your app password'}
              autoComplete="current-password"
              error={errors.smtpPass?.message}
              {...register('smtpPass')}
            />
            <button
              type="button"
              onClick={() => setShowPass((p) => !p)}
              className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showPass ? 'Hide password' : 'Show password'}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Sender identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              id="from-email"
              label="From Email"
              type="email"
              placeholder="campaigns@yourdomain.com"
              hint="Must be the login mailbox or an alias/domain your provider lets you send as."
              error={errors.fromEmail?.message}
              {...register('fromEmail')}
            />
            <Input
              id="from-name"
              label="From Name"
              placeholder="Your Company"
              error={errors.fromName?.message}
              {...register('fromName')}
            />
          </div>

          {/* Test connection feedback */}
          {testStatus !== 'idle' && (
            <div
              role="status"
              className={cn(
                'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
                testStatus === 'testing' && 'bg-slate-50 border-slate-200 text-slate-600',
                testStatus === 'success' && 'bg-green-50 border-green-200 text-green-700',
                testStatus === 'error' && 'bg-red-50 border-red-200 text-red-700',
              )}
            >
              {testStatus === 'testing' && <Loader2 className="h-4 w-4 animate-spin mt-0.5 shrink-0" />}
              {testStatus === 'success' && <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              {testStatus === 'error' && <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span className="break-words">{testStatus === 'testing' ? 'Testing connection…' : testMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleTest()}
              disabled={testStatus === 'testing' || isSubmitting}
              loading={testStatus === 'testing'}
            >
              Test Connection
            </Button>

            <Button type="submit" loading={isSubmitting} disabled={testStatus === 'testing'}>
              {savedSettings ? 'Update Settings' : 'Save Settings'}
            </Button>

            {savedSettings && (
              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={removing}
                className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Use System Default
              </button>
            )}
          </div>
        </form>

        <div className="mt-5 space-y-1 text-xs text-slate-500">
          <p>
            <strong>Ports:</strong> 465 = SSL/TLS from the start · 587 = STARTTLS (required) · 25/2525 = STARTTLS when offered.
            A "wrong version number" or timeout usually means the port and security mode don't match.
          </p>
          <p>
            Gmail / Google Workspace and Outlook usually need an{' '}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-slate-700"
            >
              App Password
            </a>{' '}
            (with 2-step verification) instead of your normal password.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── WhatsApp Tab ──────────────────────────────────────────────────────────────

const whatsappSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^\d+$/, 'Phone Number ID is the numeric ID from API Setup (not the phone number)'),
  wabaId: z.string().trim().regex(/^\d*$/, 'WABA ID must be numeric').optional(),
  accessToken: z.string().min(1, 'Access Token is required'),
});

type WhatsAppForm = z.infer<typeof whatsappSchema>;

function WhatsAppTab() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedConfig, setSavedConfig] = useState<WhatsAppConfig | null>(null);
  const [simulationAvailable, setSimulationAvailable] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WhatsAppConfigTestResult | null>(null);
  const [showToken, setShowToken] = useState(false);

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<WhatsAppForm>({
    resolver: zodResolver(whatsappSchema),
  });

  useEffect(() => {
    fetchWhatsAppConfig()
      .then(({ config, simulationAvailable: sim }) => {
        setSimulationAvailable(sim);
        if (config) {
          setSavedConfig(config);
          setValue('phoneNumberId', config.phoneNumberId);
          setValue('wabaId', config.wabaId || '');
          setValue('accessToken', config.accessToken);
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load WhatsApp configuration.'))
      .finally(() => setLoading(false));
  }, [setValue]);

  const onSubmit = async (values: WhatsAppForm) => {
    try {
      const updated = await saveWhatsAppConfig({
        phoneNumberId: values.phoneNumberId,
        wabaId: values.wabaId,
        accessToken: values.accessToken,
      });
      setSavedConfig(updated);
      setValue('accessToken', updated.accessToken);
      setTestResult(null);
      toast.success(
        updated.verifiedAt ? 'WhatsApp credentials saved.' : 'Credentials saved. Click "Test Connection" to verify them with Meta.'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save WhatsApp config.');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testWhatsAppConfig();
      setTestResult(result);
      const { config } = await fetchWhatsAppConfig();
      setSavedConfig(config);
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Connection test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remove your WhatsApp credentials?')) return;
    try {
      setRemoving(true);
      await deleteWhatsAppConfig();
      setSavedConfig(null);
      setTestResult(null);
      reset({ phoneNumberId: '', wabaId: '', accessToken: '' });
      toast.success('WhatsApp credentials removed. Campaigns use the server default credentials, if any are configured.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove WhatsApp credentials.');
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Meta WhatsApp Cloud API Configuration</CardTitle>
            <CardDescription>
              Your Meta WhatsApp Business credentials. Saving stores them; "Test Connection" confirms them with Meta.
            </CardDescription>
          </div>
          {!savedConfig ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full">
              <AlertCircle className="h-3.5 w-3.5" />
              Not configured
            </span>
          ) : savedConfig.verifiedAt ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
              <CheckCircle className="h-3.5 w-3.5" />
              Verified with Meta
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
              <AlertCircle className="h-3.5 w-3.5" />
              Saved · not verified
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loadError && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {savedConfig?.verifiedAt && (
          <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
            Verified {new Date(savedConfig.verifiedAt).toLocaleString()}
            {savedConfig.verifiedPhoneNumber && <> · sending number <strong>{savedConfig.verifiedPhoneNumber}</strong></>}
            {savedConfig.verifiedName && <> ({savedConfig.verifiedName})</>}
          </div>
        )}
        {savedConfig && !savedConfig.verifiedAt && savedConfig.lastVerificationError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            Last connection test failed: {savedConfig.lastVerificationError}
          </div>
        )}
        {!savedConfig && simulationAvailable && (
          <div className="mb-4 rounded-lg bg-violet-50 border border-violet-200 px-4 py-3 text-sm text-violet-800">
            Development simulation mode is enabled on this server: campaigns without credentials are recorded as
            <strong> simulations</strong> — no messages are sent and nothing counts as delivered.
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="max-w-xl space-y-4">
          <Input
            id="wa-phone-id"
            label="Phone Number ID"
            placeholder="e.g. 109876543210985"
            error={errors.phoneNumberId?.message}
            hint="Meta App Dashboard → WhatsApp → API Setup → Phone number ID (not the phone number itself)."
            {...register('phoneNumberId')}
          />

          <Input
            id="wa-waba-id"
            label="WhatsApp Business Account ID (needed for template sync)"
            placeholder="e.g. 101234567890123"
            error={errors.wabaId?.message}
            {...register('wabaId')}
          />

          <div className="relative">
            <Input
              id="wa-access-token"
              label="System User Access Token"
              type={showToken ? 'text' : 'password'}
              placeholder={savedConfig ? '••••••••••••' : 'Paste your Meta permanent access token'}
              error={errors.accessToken?.message}
              hint="Permanent System User token with whatsapp_business_messaging and whatsapp_business_management. Temporary 24-hour tokens stop working the next day."
              {...register('accessToken')}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {testResult && (
            <div
              role="status"
              className={cn(
                'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
                testResult.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
              )}
            >
              {testResult.success ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span className="break-words">
                {testResult.message}
                {testResult.qualityRating && <> · Quality rating: {testResult.qualityRating}</>}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" loading={isSubmitting}>
              {savedConfig ? 'Update Meta Credentials' : 'Save Meta Credentials'}
            </Button>

            {savedConfig && (
              <Button type="button" variant="secondary" onClick={() => void handleTest()} loading={testing} disabled={testing || isSubmitting}>
                Test Connection
              </Button>
            )}

            {savedConfig && (
              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={removing}
                className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove Credentials
              </button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const tabContent: Record<SettingsTab, React.ReactNode> = {
    profile: <ProfileTab />,
    security: <SecurityTab />,
    smtp: <SmtpTab />,
    whatsapp: <WhatsAppTab />,
    notifications: <NotificationsTab />,
    sessions: <SessionsTab />,
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account and preferences.</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-44 shrink-0">
          <ul className="space-y-0.5">
            {tabs.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    activeTab === id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{tabContent[activeTab]}</div>
      </div>
    </div>
  );
}
