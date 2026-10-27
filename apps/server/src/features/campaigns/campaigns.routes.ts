/**
 * Campaigns routes — CSV upload + bulk email sending + scheduling.
 *
 * RATE LIMITING:
 * - Bulk sending: 10 campaigns per hour per user
 * - CSV parsing: 50 uploads per hour per user
 * - Read operations: 200 requests per 15 min per user (global authenticated limit)
 *
 * All routes require authentication.
 */
import { Router } from 'express';
import { CampaignsController, uploadMiddleware } from './campaigns.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  bulkEmailRateLimiter,
  csvUploadRateLimiter,
} from '../../middleware/rate-limiters.middleware.js';

const router = Router();
const controller = new CampaignsController();

// All routes require authentication
router.use(authenticate);

// Read operations (uses global authenticated rate limiter)
router.get('/', controller.list);
router.get('/stats', controller.stats);
router.get('/:id', controller.getById);

// CSV parsing (rate limited separately)
router.post('/parse-preview', csvUploadRateLimiter, uploadMiddleware, controller.parsePreview);

/**
 * POST /campaigns/send
 * Upload CSV + send bulk emails with SSE progress stream (immediate)
 *
 * Rate limited: 10 campaigns per hour per user
 */
router.post(
  '/send',
  bulkEmailRateLimiter,
  uploadMiddleware,
  controller.send
);

/**
 * POST /campaigns/schedule
 * Upload CSV + schedule campaign for a future datetime.
 * Returns JSON immediately — the cron job fires the emails when the time comes.
 *
 * Rate limited: 10 campaigns per hour per user (shares limit with /send)
 */
router.post(
  '/schedule',
  bulkEmailRateLimiter,
  uploadMiddleware,
  controller.schedule
);

export { router as campaignsRouter };
