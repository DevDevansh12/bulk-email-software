/**
 * AI routes — QuillBot-style paraphrasing using Gemini or OpenAI.
 *
 * RATE LIMITING:
 * - Paraphrasing: 30 requests per hour per user (AI API cost protection)
 *
 * All routes require authentication.
 */
import { Router } from 'express';
import { AiController } from './ai.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { aiRateLimiter } from '../../middleware/rate-limiters.middleware.js';

const router = Router();
const controller = new AiController();

// All routes require authentication
router.use(authenticate);

// AI paraphrasing (rate limited: 30 requests per hour per user)
router.post('/paraphrase', aiRateLimiter, controller.paraphrase);

export { router as aiRouter };
