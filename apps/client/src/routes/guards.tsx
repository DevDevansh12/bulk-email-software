/**
 * Route guards.
 *
 * `RequireAuth`    — redirects unauthenticated users to /auth/login
 * `RedirectIfAuth` — redirects authenticated users away from auth pages to /dashboard
 *
 * Both respect `isLoading` AND `isInitialized` to prevent flash redirects during
 * session initialization on page load.
 *
 * IMPORTANT: Zustand selectors must return stable (primitive) values, not new
 * objects, to avoid the "getSnapshot should be cached" infinite loop warning.
 * Use separate useAuthStore calls per value instead of combining into one object.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth.store';
import type { ReactNode } from 'react';

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    </div>
  );
}

/** 
 * Wrap protected pages — redirect to login if not authenticated.
 * 
 * Shows loading state until:
 * 1. Session initialization completes (isInitialized)
 * 2. Auth state is determined (isLoading = false)
 * 
 * This prevents flashing protected content before redirect.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const location = useLocation();

  // Wait for session initialization AND auth check to complete
  if (!isInitialized || isLoading) {
    return <FullPageLoader />;
  }

  // Session initialized and auth checked - now make routing decision
  if (!isAuthenticated) {
    // Preserve the intended destination so we can redirect back after login
    return (
      <Navigate
        to="/auth/login"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  return <>{children}</>;
}

/** 
 * Wrap auth pages — redirect to dashboard if already authenticated.
 * 
 * Prevents authenticated users from seeing login/signup pages.
 * Shows loading state until session check completes to avoid flash.
 */
export function RedirectIfAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  // Wait for session initialization AND auth check to complete
  if (!isInitialized || isLoading) {
    return <FullPageLoader />;
  }

  // Session initialized and auth checked - now make routing decision
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
