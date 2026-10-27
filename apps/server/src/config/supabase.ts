/**
 * Supabase client singletons.
 *
 * TWO clients:
 *
 * `supabaseAdmin`  — service_role key. Bypasses RLS. Used server-side only for
 *                    admin operations (creating users, reading any row, etc.)
 *                    NEVER expose this to the client.
 *
 * `supabaseClient` — anon key. Respects RLS. Used for operations that should
 *                    run under the calling user's permissions.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/** Admin client — full DB access, server-side only */
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/** Public client — respects Row Level Security */
export const supabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
