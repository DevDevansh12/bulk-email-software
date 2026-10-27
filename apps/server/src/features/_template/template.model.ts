/**
 * Template — plain TypeScript types (Supabase/Postgres edition).
 * No ORM layer — queries use supabaseAdmin directly in the service.
 * Table name: `templates`
 */

export interface ITemplate {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
