/**
 * Meta WhatsApp Webhook Listener.
 *
 * GET  /api/v1/whatsapp/webhook -> Webhook verification challenge (needs WHATSAPP_WEBHOOK_VERIFY_TOKEN)
 * POST /api/v1/whatsapp/webhook -> Delivery status updates (sent, delivered, read, failed)
 *
 * Authenticity: POSTs must carry a valid X-Hub-Signature-256 (HMAC of the raw
 * body with WHATSAPP_APP_SECRET). Without an app secret, POSTs are rejected in
 * production and accepted with a warning in development.
 *
 * Idempotency: callbacks can repeat or arrive out of order. processStatusEvent
 * only moves a message forward and recounts the campaign counters from
 * recipient rows, so replays never inflate delivered/read numbers.
 */
import { timingSafeEqual } from 'node:crypto';

import { Router, type Request, type Response } from 'express';

import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

import { verifyMetaSignature, type MetaStatusEvent } from './whatsapp-webhook.logic.js';
import { processStatusEvent } from './whatsapp.service.js';

declare global {
  namespace Express {
    interface Request {
      /** Raw request body, captured only for the WhatsApp webhook (see app.ts) */
      rawBody?: Buffer;
    }
  }
}

const router = Router();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Webhook Verification (Meta Verification Challenge)
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.error('WhatsApp webhook verification attempted but WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set');
    res.sendStatus(403);
    return;
  }

  if (mode === 'subscribe' && typeof token === 'string' && safeEqual(token, env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    logger.info('WhatsApp webhook verified with Meta');
    res.status(200).type('text/plain').send(String(challenge ?? ''));
  } else {
    logger.warn({ mode }, 'WhatsApp webhook verification failed (token mismatch)');
    res.sendStatus(403);
  }
});

interface WebhookBody {
  object?: string;
  entry?: { changes?: { field?: string; value?: { statuses?: MetaStatusEvent[] } }[] }[];
}

// Webhook Event Callbacks (status updates)
router.post('/', (req: Request, res: Response) => {
  if (env.WHATSAPP_APP_SECRET) {
    if (!verifyMetaSignature(req.rawBody, req.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET)) {
      logger.warn('WhatsApp webhook rejected: invalid X-Hub-Signature-256');
      res.sendStatus(401);
      return;
    }
  } else if (env.NODE_ENV === 'production') {
    logger.error('WhatsApp webhook rejected: WHATSAPP_APP_SECRET is not configured');
    res.sendStatus(503);
    return;
  } else {
    logger.warn('WHATSAPP_APP_SECRET not set — accepting UNSIGNED webhook (development only)');
  }

  res.sendStatus(200); // Acknowledge quickly; Meta retries slow/failed deliveries

  const body = req.body as WebhookBody;
  if (body?.object !== 'whatsapp_business_account') return;

  const statuses: MetaStatusEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      for (const s of change.value?.statuses ?? []) {
        if (s?.id && s.status) statuses.push(s);
      }
    }
  }

  void (async () => {
    for (const status of statuses) {
      try {
        const changed = await processStatusEvent(status);
        logger.info({ wamid: status.id, status: status.status, changed }, 'WhatsApp status update processed');
      } catch (err) {
        logger.error({ err, wamid: status.id, status: status.status }, 'Error processing WhatsApp status update');
      }
    }
  })();
});

export { router as whatsappWebhookRouter };
