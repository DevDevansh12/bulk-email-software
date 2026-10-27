/**
 * Organization types shared between client and server.
 * Never includes internal DB fields (_id, __v) or sensitive data.
 */
import type { OrgRole } from '../constants/org-roles.js';

// ── Core domain types ─────────────────────────────────────────────────────────

export type OrgPlan = 'free' | 'starter' | 'pro' | 'enterprise';
export type MemberStatus = 'active' | 'invited' | 'suspended';

/**
 * Public-safe Organization shape returned to clients.
 */
export interface PublicOrganization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  logoUrl: string | undefined;
  website: string | undefined;
  isActive: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
  /** Only included when requested with member context */
  currentUserRole?: OrgRole;
}

/**
 * Public-safe Organization Member shape.
 */
export interface PublicOrgMember {
  id: string;
  userId: string;
  organizationId: string;
  role: OrgRole;
  status: MemberStatus;
  joinedAt: string | undefined;
  invitedAt: string;
  invitedBy: string | undefined;
  // Populated user fields (when joined)
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

// ── Request bodies ────────────────────────────────────────────────────────────

export interface CreateOrganizationBody {
  name: string;
  slug?: string;
  website?: string;
}

export interface UpdateOrganizationBody {
  name?: string;
  website?: string;
  logoUrl?: string;
}

export interface InviteMemberBody {
  email: string;
  role: OrgRole;
}

export interface UpdateMemberRoleBody {
  role: OrgRole;
}

export interface TransferOwnershipBody {
  newOwnerId: string;
}
