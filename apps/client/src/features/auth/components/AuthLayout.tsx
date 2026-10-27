import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Logo, LogoGradient } from '@/components/ui/Logo';

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Centered two-column auth shell.
 * Left panel: branding / illustration
 * Right panel: form card
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Left — brand panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 p-12 text-white">
        <Link to="/" className="flex items-center">
          <Logo variant="full" size="md" theme="dark" />
        </Link>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Send smarter.<br />Grow faster.
          </h1>
          <p className="text-lg text-indigo-100 leading-relaxed max-w-sm">
            Run high-deliverability email and WhatsApp campaigns, manage audiences, and track
            results — all from one powerful platform.
          </p>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { label: 'Emails delivered', value: '2.4B+' },
              { label: 'Average open rate', value: '38%' },
              { label: 'Active senders', value: '12K+' },
              { label: 'Uptime SLA', value: '99.9%' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-white/10 p-4">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-indigo-200">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-indigo-200">
          © {new Date().getFullYear()} BulkFlow. All rights reserved.
        </p>
      </div>

      {/* Right — form area */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 lg:p-12 bg-slate-50">
        {/* Mobile logo */}
        <Link to="/" className="mb-8 lg:hidden">
          <Logo variant="full" size="md" />
        </Link>

        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
