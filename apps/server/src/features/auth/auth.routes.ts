/**
 * Auth routes — Supabase Auth edition.
 * Email verification is handled entirely by Supabase (disabled in dashboard).
 *
 * RATE LIMITING:
 * - Login: 10 attempts per 15 minutes per IP
 * - Registration: 5 signups per hour per IP
 * - Password reset: 5 requests per hour per IP
 * - Token refresh: 20 refreshes per 15 minutes per IP
 *
 * All limits use IP-based rate limiting to prevent brute-force attacks.
 * Development mode has 10x multiplier for easier testing.
 */
import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  loginRateLimiter,
  registrationRateLimiter,
  passwordResetRateLimiter,
  refreshTokenRateLimiter,
} from '../../middleware/rate-limiters.middleware.js';

const controller = new AuthController();
export const authRouter = Router();

// ── Public routes (with rate limiting) ────────────────────────────────────────

authRouter.post('/register', registrationRateLimiter, controller.register);
authRouter.post('/login', loginRateLimiter, controller.login);
authRouter.post('/refresh', refreshTokenRateLimiter, controller.refresh);
authRouter.post('/forgot-password', passwordResetRateLimiter, controller.forgotPassword);
authRouter.post('/reset-password', passwordResetRateLimiter, controller.resetPassword);

// ── Authenticated routes (no additional rate limiting) ────────────────────────
// These are protected by the global authenticated API rate limiter (200 req/15min)

authRouter.get('/me', authenticate, controller.me);
authRouter.post('/logout', authenticate, controller.logout);
authRouter.post('/logout-all', authenticate, controller.logoutAll);
authRouter.post('/change-password', authenticate, controller.changePassword);
