import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Send,
  Users,
  BarChart2,
  Settings,
  Mail,
  LogOut,
  ChevronDown,
  MessageSquare,
  Zap,
  FileText,
  X,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/features/auth/auth.store';
import { toast } from '@/components/ui/Toast';
import { Logo } from '@/components/ui/Logo';
import { useState } from 'react';

const navGroups = [
  {
    title: 'MAIN OVERVIEW',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Analytics', to: '/dashboard/analytics', icon: BarChart2 },
      { label: 'Audiences', to: '/dashboard/audiences', icon: Users },
    ],
  },
  {
    title: 'EMAIL MARKETING',
    items: [
      { label: 'Send Email', to: '/dashboard/campaigns/send', icon: Mail, badge: 'PRO' },
      { label: 'Email Campaigns', to: '/dashboard/campaigns', icon: Send },
      { label: 'Email Templates', to: '/dashboard/campaigns/templates', icon: FileText },
      { label: 'Merge Variables', to: '/dashboard/campaigns/variables', icon: Sparkles },
    ],
  },
  {
    title: 'WHATSAPP MARKETING',
    items: [
      { label: 'Send WhatsApp', to: '/dashboard/whatsapp/send', icon: MessageSquare, badge: 'NEW' },
      { label: 'WhatsApp History', to: '/dashboard/whatsapp', icon: Zap },
      { label: 'Meta Templates', to: '/dashboard/whatsapp/templates', icon: FileText },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { label: 'Settings & SMTP', to: '/dashboard/settings', icon: Settings },
    ],
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const pathname = location.pathname;

  const isItemActive = (to: string): boolean => {
    if (to === '/dashboard') {
      return pathname === '/dashboard';
    }
    if (to === '/dashboard/campaigns') {
      return (
        pathname === '/dashboard/campaigns' ||
        (pathname.startsWith('/dashboard/campaigns/') &&
          !['/dashboard/campaigns/send', '/dashboard/campaigns/templates', '/dashboard/campaigns/variables'].includes(pathname))
      );
    }
    if (to === '/dashboard/whatsapp') {
      return (
        pathname === '/dashboard/whatsapp' ||
        (pathname.startsWith('/dashboard/whatsapp/') &&
          !['/dashboard/whatsapp/send', '/dashboard/whatsapp/templates'].includes(pathname))
      );
    }
    return pathname === to;
  };

  const handleLogout = async () => {
    await logout();
    toast.info('You have been signed out.');
    navigate('/auth/login', { replace: true });
  };

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  const initials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || '?';

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'flex h-screen w-64 flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-sm select-none transition-transform duration-300 z-50',
          'fixed inset-y-0 left-0 lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Branding Logo Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          <Logo 
            variant="full" 
            size="md" 
            onClick={() => {
              navigate('/dashboard');
              handleNavClick();
            }}
          />
          {/* Close button for mobile */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Categorized Navigation */}
        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-6 scrollbar-hide">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <h4 className="px-3 text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                {group.title}
              </h4>
              <ul className="space-y-0.5 pt-1">
                {group.items.map(({ label, to, icon: Icon, badge }) => {
                  const active = isItemActive(to);
                  return (
                    <li key={to}>
                      <NavLink
                        to={to}
                        onClick={handleNavClick}
                        className={cn(
                          'group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150',
                          active
                            ? 'bg-gradient-to-r from-indigo-50/90 to-purple-50/50 text-indigo-900 font-semibold shadow-xs border border-indigo-100/80'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon
                            className={cn(
                              'h-4 w-4 shrink-0 transition-transform group-hover:scale-110',
                              active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                            )}
                          />
                          <span>{label}</span>
                        </div>
                        {badge && (
                          <span
                            className={cn(
                              'text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase',
                              badge === 'NEW'
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            )}
                          >
                            {badge}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User profile section */}
        <div className="border-t border-slate-100 p-3 bg-slate-50/50">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-all hover:bg-white hover:shadow-xs border border-transparent hover:border-slate-200/60"
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-xs">
              {initials}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-800">
                {user?.firstName || 'User'} {user?.lastName || ''}
              </p>
              <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-slate-400 transition-transform',
                userMenuOpen && 'rotate-180'
              )}
            />
          </button>

          {userMenuOpen && (
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-lg animate-fade-in text-xs font-medium">
              <NavLink
                to="/dashboard/settings"
                className="flex items-center gap-2.5 px-3.5 py-2.5 text-slate-700 hover:bg-slate-50 transition-colors"
                onClick={() => {
                  setUserMenuOpen(false);
                  handleNavClick();
                }}
              >
                <Settings className="h-3.5 w-3.5 text-slate-400" />
                Settings & Configuration
              </NavLink>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-rose-600 hover:bg-rose-50 transition-colors border-t border-slate-100"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-500" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
