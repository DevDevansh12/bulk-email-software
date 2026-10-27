/**
 * Auth state — Zustand store, Supabase edition.
 *
 * Supabase manages session persistence and token refresh automatically.
 * We subscribe to onAuthStateChange to keep our store in sync with
 * Supabase's session state — single source of truth.
 *
 * Access token is injected into axios on every session change so all
 * API calls to the Express server include the current bearer token.
 */
import { create } from 'zustand';
import type { PublicUser } from '@saas/shared';
import { supabase } from '@/lib/supabase';
import { apiClient } from '@/lib/api-client';

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;

  setAuth: (user: PublicUser, token: string) => void;
  clearAuth: () => void;
  initSession: () => Promise<void>;
  logout: () => Promise<void>;
}

// Prevent multiple simultaneous initialization
let isInitializing = false;
let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true,
  isAuthenticated: false,
  isInitialized: false,

  setAuth: (user, token) => {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    set({ user, accessToken: token, isAuthenticated: true, isLoading: false, isInitialized: true });
  },

  clearAuth: () => {
    delete apiClient.defaults.headers.common['Authorization'];
    set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
  },

  /**
   * Called once on app mount.
   * Gets the existing Supabase session (from localStorage) and subscribes to
   * future auth state changes (token refresh, sign-out, etc.)
   * 
   * Race condition protection: Only initializes once even if called multiple times.
   */
  initSession: async () => {
    // Prevent duplicate initialization
    if (isInitializing) {
      return;
    }
    
    isInitializing = true;

    try {
      // Get current session from Supabase (restores from localStorage)
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const meta = (session.user.user_metadata ?? {}) as Record<string, string>;
        const appMeta = (session.user.app_metadata ?? {}) as Record<string, string>;

        const user: PublicUser = {
          id: session.user.id,
          email: session.user.email ?? '',
          firstName: meta['firstName'] ?? '',
          lastName: meta['lastName'] ?? '',
          role: (appMeta['role'] ?? meta['role'] ?? 'member') as PublicUser['role'],
          isEmailVerified: !!session.user.email_confirmed_at,
          createdAt: session.user.created_at,
          updatedAt: session.user.updated_at ?? session.user.created_at,
        };

        apiClient.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
        set({ user, accessToken: session.access_token, isAuthenticated: true, isLoading: false, isInitialized: true });
      } else {
        delete apiClient.defaults.headers.common['Authorization'];
        set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false, isInitialized: true });
      }

      // Clean up any existing subscription before creating a new one
      if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }

      // Subscribe to future auth changes (auto-refresh, sign-out from another tab, etc.)
      authSubscription = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          const meta = (session.user.user_metadata ?? {}) as Record<string, string>;
          const appMeta = (session.user.app_metadata ?? {}) as Record<string, string>;

          const user: PublicUser = {
            id: session.user.id,
            email: session.user.email ?? '',
            firstName: meta['firstName'] ?? '',
            lastName: meta['lastName'] ?? '',
            role: (appMeta['role'] ?? meta['role'] ?? 'member') as PublicUser['role'],
            isEmailVerified: !!session.user.email_confirmed_at,
            createdAt: session.user.created_at,
            updatedAt: session.user.updated_at ?? session.user.created_at,
          };

          apiClient.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
          set({ user, accessToken: session.access_token, isAuthenticated: true, isLoading: false, isInitialized: true });
        } else if (event === 'SIGNED_OUT') {
          delete apiClient.defaults.headers.common['Authorization'];
          set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false, isInitialized: true });
        }
      }).data.subscription;
    } finally {
      isInitializing = false;
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    // onAuthStateChange will fire SIGNED_OUT and clear state automatically
    // No need to manually clear state here - avoid race conditions
  },
}));
