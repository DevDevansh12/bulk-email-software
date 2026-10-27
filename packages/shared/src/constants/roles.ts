/**
 * Role hierarchy for RBAC (Role-Based Access Control).
 * Defined here so both backend guards and frontend UI
 * use the exact same set of valid role strings.
 */
export const UserRoles = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];
