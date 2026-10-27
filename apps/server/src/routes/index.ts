/**
 * Central route registry.
 *
 * All feature routers are mounted here.
 * The pattern `/api/v1/<feature>` gives us:
 * - Namespacing (no route collisions)
 * - API versioning (introduce /v2 without breaking /v1 consumers)
 */
import type { Application } from 'express';
import { env } from '../config/env.js';
import { healthRouter } from './health.routes.js';
import { authRouter } from '../features/auth/auth.routes.js';
import { campaignsRouter } from '../features/campaigns/campaigns.routes.js';
import { trackingRouter } from '../features/tracking/tracking.routes.js';
import { audiencesRouter } from '../features/audiences/audiences.routes.js';
import { analyticsRouter } from '../features/analytics/analytics.routes.js';
import { whatsappRouter } from '../features/whatsapp/whatsapp.routes.js';
import { whatsappWebhookRouter } from '../features/whatsapp/whatsapp-webhook.routes.js';
import { smtpRouter } from '../features/smtp/smtp.routes.js';
import { aiRouter } from '../features/ai/ai.routes.js';
import { templatesRouter } from '../features/templates/templates.routes.js';
import { cronRouter } from './cron.routes.js';

export function registerRoutes(app: Application): void {
  const base = `/api/${env.API_VERSION}`;

  // ── Infrastructure routes ─────────────────────────────────────────────────
  app.use('/health', healthRouter);

  // ── Public Tracking & Webhook routes ─────────────────────────────────────
  app.use(`${base}/tracking`, trackingRouter);
  app.use(`${base}/whatsapp/webhook`, whatsappWebhookRouter);

  // ── Cron Job routes ───────────────────────────────────────────────────────
  app.use(`${base}/cron`, cronRouter);

  // ── Feature routes ────────────────────────────────────────────────────────
  app.use(`${base}/auth`, authRouter);
  app.use(`${base}/campaigns`, campaignsRouter);
  app.use(`${base}/audiences`, audiencesRouter);
  app.use(`${base}/analytics`, analyticsRouter);
  app.use(`${base}/whatsapp`, whatsappRouter);
  app.use(`${base}/smtp`, smtpRouter);
  app.use(`${base}/ai`, aiRouter);
  app.use(`${base}/templates`, templatesRouter);
}
