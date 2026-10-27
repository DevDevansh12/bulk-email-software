import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('flex flex-col gap-1 p-6 pb-4', className)} {...props}>
      {children}
    </div>
  );
}

function CardTitle({ className, children, ...props }: CardProps) {
  return (
    <h2 className={cn('text-xl font-semibold text-slate-900', className)} {...props}>
      {children}
    </h2>
  );
}

function CardDescription({ className, children, ...props }: CardProps) {
  return (
    <p className={cn('text-sm text-slate-500', className)} {...props}>
      {children}
    </p>
  );
}

// Fix CardContent to allow empty (no children needed)
function CardContent({ className, children, ...props }: Omit<CardProps, 'children'> & { children?: ReactNode }) {
  return (
    <div className={cn('px-6 pb-6', className)} {...props}>
      {children}
    </div>
  );
}

function CardFooter({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('flex items-center px-6 pb-6', className)} {...props}>
      {children}
    </div>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
