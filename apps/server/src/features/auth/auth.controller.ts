/**
 * Auth controller — Supabase Auth edition.
 *
 * COOKIE STRATEGY (unchanged from MongoDB version):
 * Refresh token → httpOnly, SameSite=Strict, Secure (production)
 * Access token  → returned in response body (client stores in memory)
 *
 * Supabase issues both tokens. We intercept them here to:
 * 1. Put the refresh token in an httpOnly cookie (XSS-safe)
 * 2. Return the access token in the response body
 *
 * The access token is a signed Supabase JWT — verified locally in middleware.
 */
import type { Request, Response } from 'express';
import type { CookieOptions } from 'express';
import { sendSuccess, sendCreated } from '../../lib/response.js';
import {
  validate,
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ChangePasswordSchema,
} from './auth.validation.js';
import * as AuthService from './auth.service.js';
import { env } from '../../config/env.js';

// ── Cookie helpers ────────────────────────────────────────────────────────────

const REFRESH_TOKEN_COOKIE = 'refreshToken';
const REFRESH_TOKEN_PATH = '/api/v1/auth/refresh';

function getRefreshCookieOptions(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_TOKEN_PATH,
    maxAge: maxAgeMs,
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, getRefreshCookieOptions(7 * 24 * 60 * 60 * 1000));
}

function clearRefreshCookie(res: Response): void {
  res.cookie(REFRESH_TOKEN_COOKIE, '', { ...getRefreshCookieOptions(0) });
}

function getClientContext(req: Request): AuthService.TokenContext {
  const ctx: AuthService.TokenContext = {};
  if (req.ip) ctx.ip = req.ip;
  const ua = req.headers['user-agent'];
  if (ua) ctx.userAgent = ua;
  return ctx;
}

// ── Controllers ───────────────────────────────────────────────────────────────

export class AuthController {
  /** POST /register */
  register = async (req: Request, res: Response): Promise<void> => {
    const input = validate(RegisterSchema, req.body);
    const result = await AuthService.registerUser(input, getClientContext(req));

    if (result.refreshToken) {
      setRefreshCookie(res, result.refreshToken);
    }
    sendCreated(res, result.tokens);
  };

  /** POST /login */
  login = async (req: Request, res: Response): Promise<void> => {
    const input = validate(LoginSchema, req.body);
    const result = await AuthService.loginUser(input, getClientContext(req));

    setRefreshCookie(res, result.refreshToken);
    sendSuccess(res, result.tokens);
  };

  /** POST /refresh */
  refresh = async (req: Request, res: Response): Promise<void> => {
    const rawRefreshToken = req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (!rawRefreshToken) {
      clearRefreshCookie(res);
      res.status(401).json({
        success: false,
        error: { message: 'No refresh token provided.', code: 'UNAUTHORIZED' },
      });
      return;
    }

    const result = await AuthService.refreshTokens(rawRefreshToken, getClientContext(req));
    setRefreshCookie(res, result.refreshToken);
    sendSuccess(res, result.tokens);
  };

  /** POST /logout */
  logout = async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (accessToken) {
      await AuthService.logoutUser(accessToken);
    }

    clearRefreshCookie(res);
    sendSuccess(res, { message: 'Logged out successfully.' });
  };

  /** POST /logout-all */
  logoutAll = async (req: Request, res: Response): Promise<void> => {
    await AuthService.logoutAllSessions(req.user!.id);
    clearRefreshCookie(res);
    sendSuccess(res, { message: 'Logged out from all devices.' });
  };

  /** GET /me */
  me = async (req: Request, res: Response): Promise<void> => {
    const user = await AuthService.getCurrentUser(req.user!.id);
    sendSuccess(res, user);
  };

  /** POST /forgot-password */
  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const input = validate(ForgotPasswordSchema, req.body);
    const result = await AuthService.forgotPassword(input);
    sendSuccess(res, result);
  };

  /** POST /reset-password */
  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const input = validate(ResetPasswordSchema, req.body);
    const result = await AuthService.resetPassword(input);
    sendSuccess(res, result);
  };

  /** POST /change-password */
  changePassword = async (req: Request, res: Response): Promise<void> => {
    const input = validate(ChangePasswordSchema, req.body);
    const accessToken = req.headers.authorization?.slice(7);
    const result = await AuthService.changePassword(req.user!.id, input, accessToken);
    clearRefreshCookie(res);
    sendSuccess(res, result);
  };
}
