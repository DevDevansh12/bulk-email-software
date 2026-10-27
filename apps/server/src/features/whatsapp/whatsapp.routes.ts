/**
 * WhatsApp Express Router.
 *
 * RATE LIMITING:
 * - Bulk sending: 10 campaigns per hour per user
 * - CSV parsing: 50 uploads per hour per user
 * - Meta API checks (config test, template sync): 20 per hour per user
 * - Read operations: 200 requests per 15 min per user (global authenticated limit)
 *
 * All routes require authentication.
 */
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware.js';
import {
  bulkWhatsAppRateLimiter,
  csvUploadRateLimiter,
  whatsappMetaApiRateLimiter,
} from '../../middleware/rate-limiters.middleware.js';

import { WhatsAppController, uploadWhatsAppCsv } from './whatsapp.controller.js';

const router = Router();
const controller = new WhatsAppController();

router.use(authenticate);

// Configuration management (global authenticated limit)
router.get('/config', (req, res, next) => controller.getConfig(req, res, next));
router.post('/config', (req, res, next) => controller.saveConfig(req, res, next));
router.post('/config/test', whatsappMetaApiRateLimiter, (req, res, next) => controller.testConfig(req, res, next));
router.delete('/config', (req, res, next) => controller.deleteConfig(req, res, next));

// Campaign management (global authenticated limit)
router.get('/campaigns', (req, res, next) => controller.listCampaigns(req, res, next));
router.get('/campaigns/:id', (req, res, next) => controller.getCampaignById(req, res, next));

// Template management
router.get('/templates', (req, res, next) => controller.listTemplates(req, res, next));
router.post('/templates', (req, res, next) => controller.createTemplate(req, res, next));
router.post('/templates/sync', whatsappMetaApiRateLimiter, (req, res, next) => controller.syncTemplates(req, res, next));

// CSV parsing (rate limited)
router.post('/parse-preview', csvUploadRateLimiter, uploadWhatsAppCsv, (req, res, next) => controller.parsePreview(req, res, next));

// Bulk sending (rate limited: 10 campaigns per hour per user)
router.post('/send', bulkWhatsAppRateLimiter, uploadWhatsAppCsv, (req, res, next) => controller.send(req, res, next));

export { router as whatsappRouter };
