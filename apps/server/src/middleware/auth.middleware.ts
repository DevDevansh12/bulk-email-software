/**
 * Authentication & Authorization middleware — Supabase JWT edition.
 *
 * Supabase issues standard JWTs signed with the project's JWT secret.
 * We verify them locally (no network call) using jsonwebtoken.
 *
 * Token extraction: Authorization: Bearer <supabase_access_token>
 * The token is the Supabase session access_token from the client.
 *
 * req.user is populated with id, email, and role from the JWT claims.
 * Role is read from user_metadata.role (set via Supabase Admin API on register).
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { createError } from '../lib/app-error.js';
import { logger } from '../lib/logger.js';
import type { UserRole } from '@saas/shared';

// ── Augment Express Request ────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

// ── Supabase JWT payload shape ────────────────────────────────────────────────

interface SupabaseJwtPayload {
  sub: string;
  email: string;
  role: string; // 'authenticated' — this is the Postgres role, not our app role
  user_metadata?: {
    role?: UserRole;
    firstName?: string;
    lastName?: string;
  };
  app_metadata?: {
    role?: UserRole;
  };
  exp: number;
  iat: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

function verifySupabaseToken(token: string): SupabaseJwtPayload {
  return jwt.verify(token, env.SUPABASE_JWT_SECRET, {
    algorithms: ['HS256'],
  }) as SupabaseJwtPayload;
}

// ── authenticate ──────────────────────────────────────────────────────────────

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    throw createError.unauthorized('Authentication required. Please include a valid Bearer token.');
  }

  try {
    // Primary: Validate token directly via Supabase Auth API
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (!error && data?.user) {
      const user = data.user;
      const appRole: UserRole =
        (user.app_metadata?.['role'] as UserRole) ??
        (user.user_metadata?.['role'] as UserRole) ??
        'member';

      req.user = {
        id: user.id,
        email: user.email || '',
        role: appRole,
      };
      return next();
    }
  } catch (err) {
    logger.debug({ err, requestId: req.id }, 'Supabase auth.getUser failed, trying fallback');
  }

  // Fallback: Local JWT verification
  try {
    const payload = verifySupabaseToken(token);
    const appRole: UserRole =
      payload.app_metadata?.role ??
      payload.user_metadata?.role ??
      'member';

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: appRole,
    };
    return next();
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      throw createError.unauthorized('Access token expired. Please refresh your session.');
    }
    logger.debug({ err, requestId: req.id }, 'Invalid Supabase access token');
    throw createError.unauthorized('Invalid or malformed access token.');
  }
}

// ── authenticateOptional ──────────────────────────────────────────────────────

export function authenticateOptional(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const payload = verifySupabaseToken(token);
    const appRole: UserRole =
      payload.app_metadata?.role ??
      payload.user_metadata?.role ??
      'member';

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: appRole,
    };
  } catch {
    delete (req as { user?: AuthenticatedUser }).user;
  }

  next();
}

// ── authorize (RBAC) ──────────────────────────────────────────────────────────

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw createError.unauthorized('Authentication required.');
    }
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        { userId: req.user.id, userRole: req.user.role, requiredRoles: allowedRoles, path: req.path },
        'Authorization denied'
      );
      throw createError.forbidden(`Access denied. Required role: ${allowedRoles.join(' or ')}.`);
    }
    next();
  };
}

export function authorizeOwnerOrAdmin(...elevatedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw createError.unauthorized('Authentication required.');
    const isOwner = req.params['id'] === req.user.id;
    const hasElevatedRole = elevatedRoles.includes(req.user.role);
    if (!isOwner && !hasElevatedRole) {
      throw createError.forbidden('You do not have permission to access this resource.');
    }
    next();
  };
}
