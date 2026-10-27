/**
 * Organization-level role hierarchy.
 *
 * Separate from the global `UserRole` because:
 * - Org roles are scoped to a single organization — the same user can be
 *   an Owner in org A and a Viewer in org B simultaneously
 * - Global `UserRole` (admin, member, etc.) controls platform-level access;
 *   org roles control data access WITHIN an organization
 *
 * Hierarchy (highest → lowest privilege):
 *   owner > admin > manager > editor > viewer
 *
 * PERMISSIONS:
 * ┌─────────────┬───────┬───────┬─────────┬────────┬────────┐
 * │ Action      │ Owner │ Admin │ Manager │ Editor │ Viewer │
 * ├─────────────┼───────┼───────┼─────────┼────────┼────────┤
 * │ Delete org  │  ✓    │       │         │        │        │
 * │ Transfer    │  ✓    │       │         │        │        │
 * │ Update org  │  ✓    │  ✓    │         │        │        │
 * │ Invite      │  ✓    │  ✓    │  ✓      │        │        │
 * │ Remove mbr  │  ✓    │  ✓    │  ✓      │        │        │
 * │ Change role │  ✓    │  ✓    │         │        │        │
 * │ Write data  │  ✓    │  ✓    │  ✓      │  ✓     │        │
 * │ Read data   │  ✓    │  ✓    │  ✓      │  ✓     │  ✓     │
 * └─────────────┴───────┴───────┴─────────┴────────┴────────┘
 */

export const OrgRoles = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const;

export type OrgRole = (typeof OrgRoles)[keyof typeof OrgRoles];

/**
 * Numeric weight — higher = more privileged.
 * Used for "minimum role" checks: `roleWeight[member] >= roleWeight[required]`
 */
export const OrgRoleWeight: Record<OrgRole, number> = {
  owner: 50,
  admin: 40,
  manager: 30,
  editor: 20,
  viewer: 10,
};

/**
 * Returns true if `actual` meets or exceeds the `required` minimum.
 *
 * Usage:
 *   if (!hasOrgPermission(member.role, OrgRoles.EDITOR)) throw forbidden()
 */
export function hasOrgPermission(actual: OrgRole, required: OrgRole): boolean {
  return OrgRoleWeight[actual] >= OrgRoleWeight[required];
}

/**
 * The roles that are allowed to perform an action.
 * Maps action names → minimum org role required.
 */
export const OrgPermissions = {
  // Organization management
  DELETE_ORG: OrgRoles.OWNER,
  TRANSFER_OWNERSHIP: OrgRoles.OWNER,
  UPDATE_ORG: OrgRoles.ADMIN,
  VIEW_ORG: OrgRoles.VIEWER,

  // Member management
  INVITE_MEMBER: OrgRoles.MANAGER,
  REMOVE_MEMBER: OrgRoles.MANAGER,
  CHANGE_MEMBER_ROLE: OrgRoles.ADMIN,
  VIEW_MEMBERS: OrgRoles.VIEWER,

  // Data access
  WRITE_DATA: OrgRoles.EDITOR,
  READ_DATA: OrgRoles.VIEWER,
} as const satisfies Record<string, OrgRole>;
