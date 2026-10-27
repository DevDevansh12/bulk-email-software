/**
 * Cron job endpoints for scheduled bulk email processing.
 *
 * WHY: Allows external cron services (like cron-job.org) to trigger
 * scheduled email campaigns securely using a secret key.
 *
 * SECURITY: All endpoints require the X-Cron-Secret header to match
 * the CRON_SECRET environment variable.
 *
 * RATE LIMITING: 100 requests per hour per IP (allows ~2 per minute)
 *
 * FLOW (every minute via cron-job.org):
 *   1. cron-job.org hits POST /api/v1/cron/process with X-Cron-Secret
 *   2. We query campaigns WHERE status='scheduled' AND scheduled_at <= now()
 *   3. Each due campaign is sent headlessly (no SSE — DB-only progress)
 *   4. An audit record is written to cron_job_runs
 *   5. Response includes { processed, results[] }
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { sendSuccess } from '../lib/response.js';
import { AppError } from '../lib/app-error.js';
import { HttpStatus } from '@saas/shared';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { processScheduledCampaigns } from '../features/campaigns/campaigns.service.js';
import { cronRateLimiter } from '../middleware/rate-limiters.middleware.js';

export const cronRouter = Router();

/**
 * Middleware: Validate cron secret from header
 *
 * Expected header: X-Cron-Secret: YOUR_CRON_SECRET
 * Returns 401 if secret is missing or incorrect.
 */
function validateCronSecret(req: Request, res: Response, next: Function): void {
  const providedSecret = req.headers['x-cron-secret'];

  // Check if secret is configured
  if (!env.CRON_SECRET) {
    throw new AppError('Cron secret not configured on server', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  // Check if secret was provided
  if (!providedSecret) {
    throw new AppError('Missing X-Cron-Secret header', HttpStatus.UNAUTHORIZED);
  }

  // Validate secret matches
  if (providedSecret !== env.CRON_SECRET) {
    throw new AppError('Invalid cron secret', HttpStatus.UNAUTHORIZED);
  }

  next();
}

/**
 * POST /api/v1/cron/process
 *
 * Triggered by cron-job.org every minute. Finds all scheduled campaigns
 * whose scheduled_at has passed and sends them via the headless sender.
 *
 * Rate limited: 100 requests per hour per IP (~2 per minute)
 *
 * Optional request body: { "source": "cron-job.org" }
 */
cronRouter.post('/process', cronRateLimiter, validateCronSecret, async (req: Request, res: Response) => {
  const source = req.body?.source || 'unknown';
  const startedAt = Date.now();

  logger.info({ source }, 'Cron: /process triggered');

  let processed = 0;
  let results: object[] = [];
  let cronError: string | undefined;

  try {
    const outcome = await processScheduledCampaigns();
    processed = outcome.processed;
    results = outcome.results;
  } catch (err) {
    cronError = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err, source }, 'Cron: processScheduledCampaigns threw an error');
  }

  const durationMs = Date.now() - startedAt;

  // Write audit record to DB (fire-and-forget — don't block the response)
  supabaseAdmin
    .from('cron_job_runs')
    .insert({
      source,
      campaigns_processed: processed,
      duration_ms: durationMs,
      results: results.length > 0 ? results : null,
      error: cronError ?? null,
    })
    .then(({ error }) => {
      if (error) {
        logger.warn({ error }, 'Cron: failed to write audit record');
      }
    });

  if (cronError) {
    // Still respond 200 so cron-job.org doesn't disable the job on transient errors
    sendSuccess(res, {
      success: false,
      processed: 0,
      durationMs,
      error: cronError,
      source,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  logger.info({ source, processed, durationMs }, 'Cron: /process complete');

  sendSuccess(res, {
    success: true,
    processed,
    durationMs,
    results,
    source,
    timestamp: new Date().toISOString(),
  });
});

