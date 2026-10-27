/**
 * Auth-related types shared between client and server.
 * The server never sends password hashes or raw tokens to the client —
 * only these safe, serializable shapes.
 */
import type { PublicUser } from './user.types.js';

// ── Request bodies ────────────────────────────────────────────────────────────

export interface RegisterBody {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface ForgotPasswordBody {
  email: string;
}

export interface ResetPasswordBody {
  token: string;
  password: string;
}

export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export interface VerifyEmailBody {
  token: string;
}

// ── Response shapes ───────────────────────────────────────────────────────────

/**
 * Returned on login/register/refresh.
 * Access token is in the body (stored in memory on the client).
 * Refresh token is delivered via httpOnly cookie (not visible here).
 */
export interface AuthTokenResponse {
  accessToken: string;
  expiresIn: number; // seconds
  user: PublicUser;
}

export interface MessageResponse {
  message: string;
}

// ── JWT payload ───────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string; // user ID
  email: string;
  role: string;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string; // user ID
  tokenId: string; // maps to RefreshToken document _id
  type: 'refresh';
  iat?: number;
  exp?: number;
}
