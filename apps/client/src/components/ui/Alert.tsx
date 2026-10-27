import { type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

const alertVariants = cva(
  'relative flex items-start gap-3 rounded-md border p-4 text-sm',
  {
    variants: {
      variant: {
        info: 'border-blue-200 bg-blue-50 text-blue-800',
        success: 'border-green-200 bg-green-50 text-green-800',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        error: 'border-red-200 bg-red-50 text-red-800',
      },
    },
    defaultVariants: { variant: 'info' },
  }
);

const iconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

interface AlertProps extends VariantProps<typeof alertVariants> {
  children: ReactNode;
  className?: string;
  onDismiss?: () => void;
}

function Alert({ variant = 'info', children, className, onDismiss }: AlertProps) {
  const Icon = iconMap[variant ?? 'info'];

  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-auto -mr-1 -mt-1 rounded p-1 opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export { Alert };
