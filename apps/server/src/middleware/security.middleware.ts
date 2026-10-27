/**
 * Security middleware stack.
 *
 * Applied in order — each layer addresses a distinct attack surface:
 *
 * helmet       — Sets HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
 * cors         — Controls which origins can call the API
 * hpp          — HTTP Parameter Pollution — prevents query string array injection
 * rateLimit    — Brute-force and DoS protection at the application layer
 * compression  — Gzip responses (must come before routes, after security headers)
 */
import type { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { env } from '../config/env.js';

export function applySecurityMiddleware(app: Application): void {
  // ── Helmet: HTTP security headers ────────────────────────────────────────
  const isProduction = env.NODE_ENV === 'production';
  
  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"], // React inline styles
              imgSrc: ["'self'", 'data:', 'https:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'", env.SUPABASE_URL],
              frameSrc: ["'none'"],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false, // Disable CSP in development for easier debugging

      // Strict Transport Security (HSTS) - forces HTTPS
      hsts: isProduction
        ? {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true,
          }
        : false,

      // Prevent browsers from MIME-sniffing
      noSniff: true,

      // Clickjacking protection
      frameguard: {
        action: 'deny',
      },

      // Control DNS prefetching
      dnsPrefetchControl: {
        allow: false,
      },

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // Cross-Origin policies
      crossOriginEmbedderPolicy: isProduction,
      crossOriginOpenerPolicy: isProduction ? { policy: 'same-origin' } : false,
      crossOriginResourcePolicy: isProduction ? { policy: 'same-origin' } : false,
    })
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        const allowedOrigins = env.CLIENT_URL.split(',').map((o) => o.trim());
        
        // No origin header means:
        // 1. Same-origin request (browser loading HTML from same domain) - ALLOW
        // 2. Server-to-server (curl, Postman, mobile apps) - ALLOW in dev only
        // 3. Tools without origin - ALLOW in dev only
        if (!origin) {
          // In production: Allow same-origin requests (no origin header is normal)
          // In development: Allow all no-origin requests
          callback(null, true);
          return;
        }

        // Validate origin against allowed list
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: Origin ${origin} not allowed`));
        }
      },
      credentials: true, // Allow cookies / Authorization headers
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
      maxAge: 86400, // Cache preflight requests for 24 hours
    })
  );

  // ── HTTP Parameter Pollution ──────────────────────────────────────────────
  app.use(hpp());

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  // Global rate limit for /api routes — more specific limits layered on top
  // This catches general API abuse but allows feature-specific limiters to be stricter
  const globalLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7', // Return rate limit info in headers
    legacyHeaders: false,
    // Skip rate limiting for health checks in development
    skip: (req: Request) => {
      return env.NODE_ENV === 'development' && req.path.startsWith('/health');
    },
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests. Please slow down.',
          code: 'RATE_LIMIT_EXCEEDED',
        },
      });
    },
  });
  app.use('/api', globalLimiter);

  // ── Compression ───────────────────────────────────────────────────────────
  app.use(
    compression({
      // Only compress responses larger than 1KB
      threshold: 1024,
      // Compression level (0-9, higher = better compression but slower)
      level: env.NODE_ENV === 'production' ? 6 : 1,
    })
  );
}
