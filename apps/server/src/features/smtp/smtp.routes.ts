/**
 * SMTP Settings routes — per-user SMTP configuration.
 *
 * RATE LIMITING:
 * - SMTP test: 10 tests per hour per user (prevent SMTP server abuse)
 * - Other operations: 200 requests per 15 min per user (global authenticated limit)
 *
 * GET    /smtp        — fetch current settings (password masked)
 * POST   /smtp        — save / update settings
 * POST   /smtp/test   — test connection without saving (rate limited)
 * DELETE /smtp        — remove settings (revert to system default)
 */
import { Router } from 'express';
import { SmtpController } from './smtp.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { smtpTestRateLimiter } from '../../middleware/rate-limiters.middleware.js';

const router = Router();
const controller = new SmtpController();

// All SMTP routes require a logged-in user
router.use(authenticate);

router.get('/', controller.get);
router.post('/', controller.save);
router.post('/test', smtpTestRateLimiter, controller.test); // Rate limited
router.delete('/', controller.remove);

export { router as smtpRouter };
