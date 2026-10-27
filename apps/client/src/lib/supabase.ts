/**
 * Supabase client — browser singleton.
 *
 * Uses the anon key (public, safe to expose).
 * Session persistence is handled by Supabase automatically (localStorage by default).
 *
 * We keep our Express API as the primary backend for business logic,
 * but use Supabase client for auth session management (token refresh, etc.)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string;
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Handles email confirm / password reset redirect tokens
  },
});
