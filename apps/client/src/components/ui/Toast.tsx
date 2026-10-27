/**
 * Lightweight toast notification system.
 * Uses a Zustand store so toasts can be triggered from anywhere.
 */
import { useEffect, type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/cn';

// ── Store ──────────────────────────────────────────────────────────────────────

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { ...toast, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
      ],
    })),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience helpers */
export const toast = {
  success: (message: string, duration = 4000) =>
    useToastStore.getState().push({ message, variant: 'success', duration }),
  error: (message: string, duration = 5000) =>
    useToastStore.getState().push({ message, variant: 'error', duration }),
  info: (message: string, duration = 4000) =>
    useToastStore.getState().push({ message, variant: 'info', duration }),
  warning: (message: string, duration = 4000) =>
    useToastStore.getState().push({ message, variant: 'warning', duration }),
};

// ── Item ──────────────────────────────────────────────────────────────────────

const toastVariants = cva(
  'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg transition-all',
  {
    variants: {
      variant: {
        success: 'border-green-200 bg-white text-green-800',
        error: 'border-red-200 bg-white text-red-800',
        info: 'border-blue-200 bg-white text-blue-800',
        warning: 'border-amber-200 bg-white text-amber-800',
      },
    },
  }
);

const iconMap: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />,
  error: <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />,
  info: <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />,
  warning: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />,
};

function ToastItem({ toast: t }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const duration = t.duration ?? 4000;
    const timer = setTimeout(() => dismiss(t.id), duration);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, dismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(toastVariants({ variant: t.variant }))}
    >
      {iconMap[t.variant]}
      <p className="flex-1 text-sm font-medium">{t.message}</p>
      <button
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss notification"
        className="ml-auto -mr-1 -mt-1 rounded p-1 opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
