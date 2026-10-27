import { cn } from '@/lib/cn';

type Tone = 'green' | 'blue' | 'violet' | 'amber' | 'red' | 'slate';

interface StatusStyle {
  label: string;
  tone: Tone;
  live?: boolean;
}

const CAMPAIGN: Record<string, StatusStyle> = {
  pending: { label: 'Preparing', tone: 'slate' },
  scheduled: { label: 'Scheduled', tone: 'violet' },
  sending: { label: 'Sending', tone: 'blue', live: true },
  completed: { label: 'Completed', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
};

const EMAIL_RECIPIENT: Record<string, StatusStyle> = {
  pending: { label: 'Pending', tone: 'slate' },
  sent: { label: 'Sent', tone: 'blue' },
  failed: { label: 'Failed', tone: 'red' },
};

const WHATSAPP_RECIPIENT: Record<string, StatusStyle> = {
  pending: { label: 'Pending', tone: 'slate' },
  sent: { label: 'Accepted by Meta', tone: 'blue' },
  delivered: { label: 'Delivered', tone: 'green' },
  read: { label: 'Read', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  simulated: { label: 'Simulated', tone: 'violet' },
};

const TONE_CLASS: Record<Tone, string> = {
  green: 'badge-green',
  blue: 'badge-blue',
  violet: 'badge-violet',
  amber: 'badge-amber',
  red: 'badge-red',
  slate: 'badge-slate',
};

const DOT_CLASS: Record<Tone, string> = {
  green: 'bg-emerald-500',
  blue: 'bg-indigo-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  slate: 'bg-slate-400',
};

interface StatusBadgeProps {
  status: string;
  kind?: 'campaign' | 'email-recipient' | 'whatsapp-recipient';
  /** Completed campaign that still had failed recipients */
  hasFailures?: boolean;
  /** WhatsApp simulation — shown instead of the status so it is never mistaken for a real send */
  isSimulation?: boolean;
  title?: string;
  className?: string;
}

/** One label + color per status everywhere; the label carries the meaning, not just the color. */
export function StatusBadge({ status, kind = 'campaign', hasFailures, isSimulation, title, className }: StatusBadgeProps) {
  const map = kind === 'campaign' ? CAMPAIGN : kind === 'email-recipient' ? EMAIL_RECIPIENT : WHATSAPP_RECIPIENT;
  let style: StatusStyle = map[status] ?? { label: status, tone: 'slate' };

  if (isSimulation) style = { label: 'Simulation', tone: 'violet' };
  else if (kind === 'campaign' && status === 'completed' && hasFailures) style = { label: 'Completed with errors', tone: 'amber' };

  return (
    <span className={cn('badge whitespace-nowrap', TONE_CLASS[style.tone], className)} title={title}>
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[style.tone], style.live && 'animate-pulse')} aria-hidden="true" />
      {style.label}
    </span>
  );
}
