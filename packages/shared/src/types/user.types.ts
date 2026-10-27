import type { UserRole } from '../constants/roles.js';

/**
 * The canonical User shape shared between frontend and backend.
 * Never includes sensitive fields like password hashes.
 */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isEmailVerified: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
}
