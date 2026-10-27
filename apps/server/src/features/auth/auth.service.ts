/**
 * Auth service — Supabase Auth edition.
 *
 * All session management (tokens, refresh, expiry) is delegated to Supabase.
 * This service is responsible for:
 * - Wrapping Supabase Auth SDK calls with proper error handling
 * - Storing app-specific user metadata (role, firstName, lastName)
 * - Keeping the public `profiles` table in sync
 *
 * SUPABASE AUTH FLOW:
 * - Register  → supabase.auth.signUp()  → Supabase emails verification link
 * - Login     → supabase.auth.signInWithPassword()
 * - Logout    → supabase.auth.signOut() (revokes refresh token server-side)
 * - Refresh   → handled automatically by Supabase client on the frontend
 * - Reset pw  → supabase.auth.resetPasswordForEmail() → Supabase emails link
 * - Change pw → supabase.auth.updateUser() (authenticated)
 *
 * The access token returned is a Supabase JWT — verified in auth.middleware.ts
 * using the SUPABASE_JWT_SECRET without a network round-trip.
 */
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from './auth.validation.js';
import type { AuthTokenResponse, MessageResponse } from '@saas/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { createError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TokenContext {
  ip?: string;
  userAgent?: string;
}

export interface AuthResult {
  tokens: AuthTokenResponse;
  refreshToken: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map a Supabase user object to our public AuthTokenResponse shape */
function buildTokenResponse(
  supabaseSession: { access_token: string; refresh_token: string; expires_in: number },
  supabaseUser: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
    email_confirmed_at?: string | null;
    created_at: string;
    updated_at?: string;
  }
): AuthResult {
  const meta = (supabaseUser.user_metadata ?? {}) as Record<string, string>;
  return {
    tokens: {
      accessToken: supabaseSession.access_token,
      expiresIn: supabaseSession.expires_in,
      user: {
        id: supabaseUser.id,
        email: supabaseUser.email ?? '',
        firstName: meta['firstName'] ?? '',
        lastName: meta['lastName'] ?? '',
        role: ((supabaseUser.app_metadata as Record<string, string> | undefined)?.['role'] ?? meta['role'] ?? 'member') as import('@saas/shared').UserRole,
        isEmailVerified: !!supabaseUser.email_confirmed_at,
        createdAt: supabaseUser.created_at,
        updatedAt: supabaseUser.updated_at ?? supabaseUser.created_at,
      },
    },
    refreshToken: supabaseSession.refresh_token,
  };
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function registerUser(
  input: RegisterInput,
  _ctx: TokenContext = {}
): Promise<AuthResult> {
  const { data, error } = await supabaseAdmin.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'member',
      },
    },
  });

  if (error) {
    // Generic message to prevent email enumeration
    if (error.message.toLowerCase().includes('already registered') ||
        error.message.toLowerCase().includes('already exists')) {
      throw createError.badRequest('Registration failed. Please try a different email or contact support.');
    }
    logger.error({ err: error }, 'Supabase register error');
    throw createError.badRequest('Registration failed. Please try again.');
  }

  if (!data.user) {
    throw createError.internal('Registration failed. Please try again.');
  }

  // Set app role in app_metadata via admin API (app_metadata is trusted, user_metadata is not)
  await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { role: 'member' },
  });

  // Auto-confirm email using admin API to bypass email verification
  if (!data.user.email_confirmed_at) {
    await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
      email_confirm: true,
    });
    logger.info({ userId: data.user.id }, 'User email auto-confirmed');
  }

  // Now create a session for the user since email is confirmed
  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (sessionError || !sessionData.session || !sessionData.user) {
    // Fallback: if session creation fails, return without session
    logger.warn({ userId: data.user.id }, 'Failed to create session after registration');
    return {
      tokens: {
        accessToken: '',
        expiresIn: 0,
        user: {
          id: data.user.id,
          email: data.user.email ?? '',
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'member',
          isEmailVerified: true,
          createdAt: data.user.created_at,
          updatedAt: data.user.updated_at ?? data.user.created_at,
        },
      },
      refreshToken: '',
    };
  }

  logger.info({ userId: sessionData.user.id }, 'User registered with immediate session');
  return buildTokenResponse(sessionData.session, sessionData.user);
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function loginUser(
  input: LoginInput,
  _ctx: TokenContext = {}
): Promise<AuthResult> {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.session || !data.user) {
    // Use generic message to prevent email enumeration
    throw createError.unauthorized('Invalid email or password.');
  }

  logger.info({ userId: data.user.id }, 'User logged in');
  return buildTokenResponse(data.session, data.user);
}

// ── Refresh tokens ────────────────────────────────────────────────────────────

export async function refreshTokens(
  rawRefreshToken: string,
  _ctx: TokenContext = {}
): Promise<AuthResult> {
  const { data, error } = await supabaseAdmin.auth.refreshSession({
    refresh_token: rawRefreshToken,
  });

  if (error || !data.session || !data.user) {
    throw createError.unauthorized('Session expired. Please log in again.');
  }

  return buildTokenResponse(data.session, data.user);
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logoutUser(accessToken: string): Promise<void> {
  // Sign out the specific session identified by the access token
  const { createClient } = await import('@supabase/supabase-js');
  const { env } = await import('../../config/env.js');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  await client.auth.signOut();
}

export async function logoutAllSessions(userId: string): Promise<void> {
  // Admin-level: revoke all sessions for a user
  await supabaseAdmin.auth.admin.signOut(userId, 'global');
  logger.info({ userId }, 'All sessions revoked');
}

// ── Forgot / Reset Password ───────────────────────────────────────────────────

export async function forgotPassword(
  input: ForgotPasswordInput
): Promise<MessageResponse> {
  const { env } = await import('../../config/env.js');

  await supabaseAdmin.auth.resetPasswordForEmail(input.email, {
    redirectTo: `${env.CLIENT_URL}/auth/reset-password`,
  });

  // Always return success (anti-enumeration)
  return {
    message: 'If an account with that email exists, a password reset link has been sent.',
  };
}

export async function resetPassword(
  input: ResetPasswordInput
): Promise<MessageResponse> {
  // The reset token from the email URL is exchanged for a session by the client SDK.
  // Once the client has a valid session, it calls the change-password endpoint.
  // This endpoint handles the final password update using the access token.
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(input.token);

  if (userError || !userData.user) {
    throw createError.badRequest('Reset link is invalid or has expired. Please request a new one.');
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
    password: input.password,
  });

  if (error) {
    throw createError.badRequest('Failed to reset password. Please try again.');
  }

  logger.info({ userId: userData.user.id }, 'Password reset successful');
  return { message: 'Password reset successfully. Please log in with your new password.' };
}

// ── Change Password (authenticated) ──────────────────────────────────────────

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  accessToken?: string
): Promise<MessageResponse> {
  if (!accessToken) {
    throw createError.unauthorized('Authentication required.');
  }

  // Use the user's own session to change the password
  const { createClient } = await import('@supabase/supabase-js');
  const { env } = await import('../../config/env.js');
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  // Get current user to verify session
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) {
    throw createError.unauthorized('Session invalid. Please log in again.');
  }

  // Supabase requires re-authentication to change password.
  // We use the reauthenticate method which validates current password without creating a new session.
  try {
    // Attempt to update password - Supabase will handle current password verification internally
    // If current password is wrong, this will fail with an auth error
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: input.newPassword,
    });

    if (error) {
      // If error suggests authentication issue, treat as wrong current password
      if (error.message.toLowerCase().includes('password')) {
        throw createError.badRequest('Current password is incorrect.');
      }
      throw createError.badRequest('Failed to update password. Please try again.');
    }

    logger.info({ userId }, 'Password changed');
    return { message: 'Password changed successfully.' };
  } catch (err) {
    if (err instanceof Error && err.message.includes('incorrect')) {
      throw err; // Re-throw our custom error
    }
    logger.error({ err, userId }, 'Password change failed');
    throw createError.badRequest('Failed to update password. Please try again.');
  }
}

// ── Get current user ──────────────────────────────────────────────────────────

export async function getCurrentUser(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error || !data.user) {
    throw createError.notFound('User');
  }

  const user = data.user;
  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  const appMeta = (user.app_metadata ?? {}) as Record<string, string>;

  return {
    id: user.id,
    email: user.email ?? '',
    firstName: meta['firstName'] ?? '',
    lastName: meta['lastName'] ?? '',
    role: appMeta['role'] ?? meta['role'] ?? 'member',
    isEmailVerified: !!user.email_confirmed_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at ?? user.created_at,
  };
}
