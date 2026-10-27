/**
 * Health check endpoints — Supabase edition.
 * /live  → process is alive (quick, no I/O)
 * /ready → reports the cached Supabase connection state set during bootstrap
 *
 * NOTE: /ready uses the cached state from database.ts rather than making a
 * fresh network call every time, so it is safe to poll frequently.
 * The startup health-check in database.ts is the single source of truth.
 */
import { Router } from 'express';
import { sendSuccess } from '../lib/response.js';
import { isDatabaseHealthy, getDatabaseError } from '../config/database.js';
import type { Request, Response } from 'express';

export const healthRouter = Router();

// Liveness: process is alive
healthRouter.get('/live', (_req: Request, res: Response) => {
  sendSuccess(res, { status: 'ok' });
});

// Readiness: Supabase reachable?
healthRouter.get('/ready', (_req: Request, res: Response) => {
  const healthy = isDatabaseHealthy();
  const dbError = getDatabaseError();

  const checks = {
    database: healthy ? 'ok' : 'degraded',
    database_error: healthy ? null : dbError,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: checks,
  });
});

// Combined status (default /health route)
healthRouter.get('/', (_req: Request, res: Response) => {
  sendSuccess(res, {
    status: 'ok',
    environment: process.env['NODE_ENV'],
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
