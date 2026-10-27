/**
 * Organization — plain TypeScript types (Supabase/Postgres edition).
 * No ORM layer — queries use supabaseAdmin directly in the service.
 * Table name: `organizations`
 *
 * The full schema (DDL) lives in:
 *   apps/server/supabase/migrations/001_initial_schema.sql
 */
import type { OrgPlan, OrgRole } from '@saas/shared';

export interface IOrgSettings {
  requireEmailVerification: boolean;
  allowMemberInvites: boolean;
  maxMembers: number;           // 0 = unlimited
  defaultMemberRole: OrgRole;
}

export interface IOrganization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  logo_url: string | null;
  website: string | null;
  is_active: boolean;
  owner_id: string;             // references auth.users.id
  settings: IOrgSettings;
  created_at: string;
  updated_at: string;
}
