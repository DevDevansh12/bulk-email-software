/**
 * Audiences routes — contact list management.
 *
 * RATE LIMITING:
 * - CSV upload: 50 uploads per hour per user
 * - Other operations: 200 requests per 15 min per user (global authenticated limit)
 *
 * All routes require authentication.
 */
import { Router } from 'express';
import { AudiencesController, audienceUploadMiddleware } from './audiences.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { csvUploadRateLimiter } from '../../middleware/rate-limiters.middleware.js';

const router = Router();
const controller = new AudiencesController();

router.use(authenticate);

// CRUD operations (global authenticated limit)
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.delete('/:id', controller.delete);

// CSV contact upload (rate limited: 50 uploads per hour per user)
router.post('/:id/contacts', csvUploadRateLimiter, audienceUploadMiddleware, controller.addContacts);

export { router as audiencesRouter };
