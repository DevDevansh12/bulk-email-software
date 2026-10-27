/**
 * Public Tracking Routes (No Auth Middleware Required).
 *
 * RATE LIMITING:
 * - Tracking events: 1000 events per 15 minutes per IP (very permissive)
 *
 * GET /api/v1/tracking/open/:campaignId/:recipientId.gif -> Pixel image
 * GET /api/v1/tracking/click/:campaignId/:recipientId?url=... -> Link redirect
 *
 * NOTE: These endpoints are public because they're embedded in emails.
 * Rate limiting is permissive to avoid blocking legitimate email opens/clicks.
 */
import { Router, type Request, type Response } from 'express';
import { TRANSPARENT_GIF_BUFFER, recordOpen, recordClick } from './tracking.service.js';
import { trackingRateLimiter } from '../../middleware/rate-limiters.middleware.js';

const router = Router();

// Apply rate limiting to all tracking routes
router.use(trackingRateLimiter);

// Pixel Open Tracking
router.get('/open/:campaignId/:recipientId.gif', (req: Request, res: Response) => {
  const campaignId = req.params['campaignId'] as string;
  const recipientId = req.params['recipientId'] as string;
  
  if (campaignId && recipientId) {
    void recordOpen(campaignId, recipientId);
  }

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(TRANSPARENT_GIF_BUFFER);
});

// Link Click Tracking
router.get('/click/:campaignId/:recipientId', (req: Request, res: Response) => {
  const campaignId = req.params['campaignId'] as string;
  const recipientId = req.params['recipientId'] as string;
  const targetUrl = req.query['url'] as string;

  if (campaignId && recipientId) {
    void recordClick(campaignId, recipientId);
  }

  const destination = targetUrl && targetUrl.startsWith('http') ? targetUrl : '/';
  res.redirect(302, destination);
});

export { router as trackingRouter };
