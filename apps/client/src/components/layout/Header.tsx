import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Bell, Search, Plus, Mail, MessageSquare, ChevronRight, Menu } from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth.store';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';

interface HeaderProps {
  className?: string;
  onMenuClick?: () => void;
}

const routeNames: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/campaigns': 'Email Campaigns',
  '/dashboard/campaigns/send': 'Send Email Campaign',
  '/dashboard/whatsapp': 'WhatsApp Marketing',
  '/dashboard/whatsapp/send': 'Send WhatsApp Campaign',
  '/dashboard/whatsapp/templates': 'Meta WhatsApp Templates',
  '/dashboard/audiences': 'Audiences & Subscribers',
  '/dashboard/analytics': 'Analytics & Performance',
  '/dashboard/settings': 'Settings & Configuration',
};

export function Header({ className, onMenuClick }: HeaderProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const currentPathName = routeNames[location.pathname] || 'Dashboard';

  return (
    <header
      className={cn(
        'flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-4 sm:px-6 z-10 select-none',
        className
      )}
    >
      {/* Left — Hamburger toggle (mobile) + Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-xl border border-slate-200/80 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>

        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <Link to="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors hidden sm:inline">
            Dashboard
          </Link>
          {location.pathname !== '/dashboard' && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 hidden sm:inline" />
              <span className="font-bold text-slate-800 truncate max-w-[140px] sm:max-w-none">{currentPathName}</span>
            </>
          )}
        </div>
      </div>

      {/* Center — Search bar (Desktop) */}
      <div className="hidden md:flex items-center gap-2 max-w-xs w-full bg-slate-100/70 border border-slate-200/60 rounded-xl px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition-all cursor-pointer">
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <span className="flex-1">Search campaigns, audiences...</span>
        <kbd className="bg-white border border-slate-200/80 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-400">Ctrl K</kbd>
      </div>

      {/* Right — Actions & Quick Create */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Create Dropdown */}
        <div className="relative">
          <Button
            size="sm"
            className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-xs rounded-xl flex items-center gap-1.5 text-xs"
            onClick={() => setCreateMenuOpen((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Campaign</span>
          </Button>

          {createMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xl animate-fade-in z-50 text-xs font-medium space-y-1">
              <Link
                to="/dashboard/campaigns/send"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                onClick={() => setCreateMenuOpen(false)}
              >
                <div className="p-1 rounded-md bg-indigo-100 text-indigo-700">
                  <Mail className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="font-semibold">Send Email</p>
                  <p className="text-[10px] text-slate-400">Bulk email wizard</p>
                </div>
              </Link>
              <Link
                to="/dashboard/whatsapp/send"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                onClick={() => setCreateMenuOpen(false)}
              >
                <div className="p-1 rounded-md bg-emerald-100 text-emerald-700">
                  <MessageSquare className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="font-semibold">Send WhatsApp</p>
                  <p className="text-[10px] text-slate-400">Meta Cloud API</p>
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* Notification Bell */}
        <button
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/70 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-600 ring-2 ring-white animate-pulse" />
        </button>
      </div>
    </header>
  );
}
