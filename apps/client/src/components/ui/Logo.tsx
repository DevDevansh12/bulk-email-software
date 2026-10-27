/**
 * Logo Component
 * 
 * Reusable logo component that can be used in Sidebar, Header, and Auth pages.
 * Supports different sizes and variants (full with text, icon only, image logo).
 * 
 * SETUP:
 * 1. Logo file is located at: apps/client/public/images/Logo.png
 * 2. The component automatically uses it
 * 3. Fallback to icon if image is not found
 */
import { cn } from '@/lib/cn';
import { Sparkles, Mail, Zap } from 'lucide-react';
import { useState } from 'react';

interface LogoProps {
  variant?: 'full' | 'icon' | 'image';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showVersion?: boolean;
  showSubtitle?: boolean;
  onClick?: () => void;
  theme?: 'light' | 'dark'; // For use on colored backgrounds
}

// Logo image path - using Logo.png from the public/images folder
const LOGO_PATH = '/images/Logo.png';

export function Logo({ 
  variant = 'full', 
  size = 'md', 
  className,
  showVersion = false,
  showSubtitle = true,
  onClick,
  theme = 'light'
}: LogoProps) {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: {
      icon: 'h-7 w-7',
      image: 'h-8',  // Slightly bigger for better visibility
      iconInner: 'h-4 w-4',
      text: 'text-sm',
      subtitle: 'text-[10px]',
      badge: 'text-[9px] px-1 py-0.2',
    },
    md: {
      icon: 'h-9 w-9',
      image: 'h-12',  // Increased from h-9 to h-12 for better logo display
      iconInner: 'h-5 w-5',
      text: 'text-base',
      subtitle: 'text-[11px]',
      badge: 'text-[10px] px-1.5 py-0.2',
    },
    lg: {
      icon: 'h-12 w-12',
      image: 'h-16',  // Increased from h-12 to h-16 for large variant
      iconInner: 'h-7 w-7',
      text: 'text-xl',
      subtitle: 'text-xs',
      badge: 'text-[11px] px-2 py-0.5',
    },
  };

  const sizes = sizeClasses[size];

  // Icon only variant (fallback icon)
  if (variant === 'icon') {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 shadow-md shadow-indigo-500/20 text-white',
          sizes.icon,
          onClick && 'cursor-pointer hover:shadow-lg hover:shadow-indigo-500/30 transition-shadow',
          className
        )}
        onClick={onClick}
      >
        <Sparkles className={sizes.iconInner} />
      </div>
    );
  }

  // Image logo variant (your PNG logo)
  if (variant === 'image') {
    return (
      <div
        className={cn(
          'flex items-center',
          onClick && 'cursor-pointer',
          className
        )}
        onClick={onClick}
      >
        <img
          src={LOGO_PATH}
          alt="Logo"
          className={cn(
            'object-contain',
            sizes.image,
            onClick && 'hover:opacity-90 transition-opacity'
          )}
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  // Full logo with image or fallback to icon + text
  return (
    <div
      className={cn(
        'flex items-center gap-3',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {/* Logo Icon/Image - Only show the image, no text */}
      {!imageError ? (
        <img
          src={LOGO_PATH}
          alt="Logo"
          className={cn(
            'object-contain',
            sizes.image,
            onClick && 'hover:opacity-90 transition-opacity'
          )}
          onError={() => setImageError(true)}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 shadow-md shadow-indigo-500/20 text-white',
            sizes.icon,
            onClick && 'hover:shadow-lg hover:shadow-indigo-500/30 transition-shadow'
          )}
        >
          <Sparkles className={sizes.iconInner} />
        </div>
      )}
    </div>
  );
}

/**
 * Alternative logo variants for different contexts
 */

// Simple text-only logo
export function LogoText({ className }: { className?: string }) {
  return (
    <span className={cn('font-bold text-slate-900 tracking-tight', className)}>
      BulkFlow
    </span>
  );
}

// Minimal logo with gradient text
export function LogoGradient({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <span
      className={cn(
        'font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent',
        sizeClasses[size],
        className
      )}
    >
      BulkFlow
    </span>
  );
}

// Logo with icon combination (Mail + Zap)
export function LogoIconCombo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 shadow-md shadow-indigo-500/20 text-white relative',
        className
      )}
    >
      <Mail className="h-5 w-5 absolute top-1.5 left-1.5" />
      <Zap className="h-4 w-4 absolute bottom-1 right-1 text-yellow-300" />
    </div>
  );
}
