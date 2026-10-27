/**
 * Express application factory.
 *
 * WHY separate app.ts from index.ts:
 * - `app.ts` builds and configures the Express app
 * - `index.ts` handles the actual server binding (listen) and process signals
 * - This separation lets tests import the app without starting a real server,
 *   and makes the listen port a deployment detail, not an app concern.
 *
 * Middleware registration order is deliberate:
 * 1. Security headers (must be first — before any response is written)
 * 2. Request ID (needed by logger)
 * 3. HTTP logger (needs request ID)
 * 4. Body parsing
 * 5. API routes (must be before static files)
 * 6. Static file serving (React build)
 * 7. SPA fallback (React Router catch-all)
 * 8. 404 handler
 * 9. Error handler (always last)
 */
import 'express-async-errors'; // Patches Express to catch async errors — no try/catch needed in handlers
import cookieParser from 'cookie-parser';
import express from 'express';

import { env } from './config/env.js';
import { notFoundMiddleware, errorMiddleware } from './middleware/error.middleware.js';
import { httpLogger } from './middleware/http-logger.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { applySecurityMiddleware } from './middleware/security.middleware.js';
import { serveStaticFiles, serveSpaFallback } from './middleware/static.middleware.js';
import { registerRoutes } from './routes/index.js';

export function createApp(): express.Application {
  const app = express();

  // ── Security ──────────────────────────────────────────────────────────────
  applySecurityMiddleware(app);

  // ── Request tracing ───────────────────────────────────────────────────────
  app.use(requestIdMiddleware);

  // ── HTTP logging ──────────────────────────────────────────────────────────
  app.use(httpLogger);

  // ── Body parsing ──────────────────────────────────────────────────────────
  // Limit body size to prevent DoS via large payloads
  app.use(
    express.json({
      limit: '10mb',
      // Meta signs the exact raw bytes; keep them only for the WhatsApp webhook
      verify: (req, _res, buf) => {
        if ((req as express.Request).originalUrl?.includes('/whatsapp/webhook')) {
          (req as express.Request).rawBody = Buffer.from(buf);
        }
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // ── Trust proxy ───────────────────────────────────────────────────────────
  // Required when running behind a reverse proxy (nginx, AWS ALB) so that
  // req.ip reflects the real client IP, not the proxy IP.
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  // API routes must be registered BEFORE static file serving to ensure
  // API endpoints are not shadowed by the React Router catch-all
  registerRoutes(app);

  // ── Static file serving ───────────────────────────────────────────────────
  // Serve built React application from /public directory
  // This handles all static assets (JS, CSS, images, fonts)
  app.use(serveStaticFiles());

  // ── React Router catch-all ────────────────────────────────────────────────
  // Serve index.html for all non-API routes to support client-side routing
  // Must be AFTER API routes and static files, but BEFORE 404 handler
  app.use(serveSpaFallback());

  // ── 404 & Error handling (always last) ────────────────────────────────────
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
