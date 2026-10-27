/**
 * Granular rate limiting middleware for abuse protection.
 *
 * WHY SEPARATE RATE LIMITERS:
 * - Different endpoints have different abuse risks and performance costs
 * - Authentication endpoints need strict limits (brute-force protection)
 * - Expensive operations (bulk sending, AI) need lower limits
 * - Read-only operations can be more permissive
 *
 * RATE LIMITING STRATEGY:
 * - IP-based for unauthenticated endpoints (login, signup, password reset)
 * - User-based for authenticated expensive operations
 * - Public endpoints (tracking) have minimal limits
 *
 * REVERSE PROXY CONSIDERATIONS:
 * - Express 'trust proxy' setting (in app.ts) ensures req.ip reflects real client IP
 * - Works behind nginx, ALB, Cloudflare
 *
 * DEVELOPMENT:
 * - Rate limits are applied in all environments
 * - More permissive limits in development (see multipliers)
 * - Health checks exempt from global rate limit
 */
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '../config/env.js';

/**
 * Development mode multiplier — increases rate limits for local testing.
 * Production: 1x (strict)
 * Development: 10x (permissive)
 */
const DEV_MULTIPLIER = env.NODE_ENV === 'development' ? 10 : 1;

/**
 * Standard rate limit response handler.
 */
function rateLimitHandler(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: res.getHeader('Retry-After'),
      },
    });
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION ENDPOINTS (IP-based — prevent brute-force)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Login rate limiter
 *
 * Limits: 10 attempts per 15 minutes per IP
 * Dev: 100 attempts per 15 minutes
 *
 * Protects against:
 * - Credential stuffing attacks
 * - Password brute-force attempts
 * - Account enumeration via timing
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all attempts (even successful)
  handler: rateLimitHandler(
    'Too many login attempts from this IP. Please try again in 15 minutes.'
  ),
});

/**
 * Registration rate limiter
 *
 * Limits: 5 signups per hour per IP
 * Dev: 50 signups per hour
 *
 * Protects against:
 * - Mass account creation
 * - Email enumeration
 * - Spam account creation
 */
export const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: rateLimitHandler(
    'Too many registration attempts from this IP. Please try again in 1 hour.'
  ),
});

/**
 * Password reset rate limiter (forgot password + reset password)
 *
 * Limits: 5 requests per hour per IP
 * Dev: 50 requests per hour
 *
 * Protects against:
 * - Email bombing (sending reset emails to victim)
 * - Account enumeration
 * - Token brute-force attempts
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler(
    'Too many password reset requests from this IP. Please try again in 1 hour.'
  ),
});

/**
 * Token refresh rate limiter
 *
 * Limits: 20 refreshes per 15 minutes per IP
 * Dev: 200 refreshes per 15 minutes
 *
 * Protects against:
 * - Token harvesting
 * - Session fixation attempts
 */
export const refreshTokenRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler(
    'Too many token refresh requests. Please try again in 15 minutes.'
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSIVE OPERATIONS (requires authentication)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bulk email sending rate limiter
 *
 * Limits: 10 campaigns per hour per user
 * Dev: 100 campaigns per hour
 *
 * Protects against:
 * - Email bombing
 * - SMTP resource exhaustion
 * - Cost overruns (if using paid SMTP service)
 *
 * Applied to:
 * - POST /campaigns/send
 * - POST /campaigns/schedule
 */
export const bulkEmailRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Use user ID as key (requires authentication middleware before this)
  keyGenerator: (req: Request) => {
    // req.user is set by authenticate middleware
    return req.user?.id || req.ip || 'unknown';
  },
  handler: rateLimitHandler(
    'Campaign sending limit reached. You can send up to 10 campaigns per hour. Please try again later.'
  ),
});

/**
 * WhatsApp bulk sending rate limiter
 *
 * Limits: 10 campaigns per hour per user
 * Dev: 100 campaigns per hour
 *
 * Protects against:
 * - WhatsApp API quota exhaustion
 * - Cost overruns (WhatsApp charges per message)
 * - Spam/abuse reports
 *
 * Applied to:
 * - POST /whatsapp/send
 */
export const bulkWhatsAppRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  handler: rateLimitHandler(
    'WhatsApp campaign sending limit reached. You can send up to 10 campaigns per hour. Please try again later.'
  ),
});

/**
 * AI paraphrasing rate limiter
 *
 * Limits: 30 requests per hour per user
 * Dev: 300 requests per hour
 *
 * Protects against:
 * - AI API quota exhaustion
 * - Cost overruns (OpenAI/Gemini charge per request)
 * - Abuse of AI endpoints
 *
 * Applied to:
 * - POST /ai/paraphrase
 */
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  handler: rateLimitHandler(
    'AI paraphrasing limit reached. You can make up to 30 requests per hour. Please try again later.'
  ),
});

/**
 * CSV upload/parsing rate limiter
 *
 * Limits: 50 uploads per hour per user
 * Dev: 500 uploads per hour
 *
 * Protects against:
 * - Server resource exhaustion (CPU/memory from parsing large CSVs)
 * - Disk space exhaustion
 *
 * Applied to:
 * - POST /campaigns/parse-preview
 * - POST /whatsapp/parse-preview
 * - POST /audiences/:id/contacts
 */
export const csvUploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  handler: rateLimitHandler(
    'CSV upload limit reached. You can upload up to 50 files per hour. Please try again later.'
  ),
});

/**
 * SMTP test connection rate limiter
 *
 * Limits: 10 tests per hour per user
 * Dev: 100 tests per hour
 *
 * Protects against:
 * - SMTP server abuse (connection attempts)
 * - Credential validation attacks
 *
 * Applied to:
 * - POST /smtp/test
 */
export const smtpTestRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  handler: rateLimitHandler(
    'SMTP test limit reached. You can test connections up to 10 times per hour. Please try again later.'
  ),
});

/**
 * WhatsApp (Meta API) connection test / template sync rate limiter
 *
 * Limits: 20 calls per hour per user
 * Dev: 200 calls per hour
 *
 * Protects against:
 * - Burning the Meta Graph API rate limit of the user's app
 *
 * Applied to:
 * - POST /whatsapp/config/test
 * - POST /whatsapp/templates/sync
 */
export const whatsappMetaApiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  handler: rateLimitHandler(
    'Meta API check limit reached (20 per hour). Please try again later.'
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS (minimal protection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Email tracking rate limiter (pixel opens + link clicks)
 *
 * Limits: 1000 events per 15 minutes per IP
 * Dev: 10000 events per 15 minutes
 *
 * Protects against:
 * - Database write flooding
 * - Analytics pollution
 *
 * Applied to:
 * - GET /tracking/open/:campaignId/:recipientId.gif
 * - GET /tracking/click/:campaignId/:recipientId
 *
 * NOTE: Very permissive because legitimate users may open emails multiple times
 * and high-traffic campaigns can generate many tracking events quickly.
 */
export const trackingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipFailedRequests: true, // Only count successful tracking events
  handler: rateLimitHandler(
    'Too many tracking requests from this IP. Please try again in 15 minutes.'
  ),
});

/**
 * Cron endpoint rate limiter
 *
 * Limits: 100 requests per hour per IP
 * Dev: 1000 requests per hour
 *
 * Protects against:
 * - Unauthorized cron trigger attempts
 * - Resource exhaustion from repeated campaign processing
 *
 * Applied to:
 * - POST /cron/process
 *
 * NOTE: This is secondary protection. Primary protection is the CRON_SECRET header.
 * Allows ~2 requests per minute (cron services typically run every 1-5 minutes).
 */
export const cronRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler(
    'Too many cron requests from this IP. Please try again in 1 hour.'
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// MODERATE OPERATIONS (authenticated, less expensive)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * General API rate limiter for authenticated operations
 *
 * Limits: 200 requests per 15 minutes per user
 * Dev: 2000 requests per 15 minutes
 *
 * Protects against:
 * - API abuse
 * - Accidental infinite loops in client code
 *
 * Applied to:
 * - CRUD operations (audiences, templates, campaigns list, etc.)
 * - Analytics queries
 * - User profile operations
 *
 * NOTE: This is a fallback for authenticated endpoints that don't have
 * specific rate limiters. Most read operations use this.
 */
export const authenticatedApiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200 * DEV_MULTIPLIER,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  handler: rateLimitHandler(
    'Too many API requests. Please try again in 15 minutes.'
  ),
});
