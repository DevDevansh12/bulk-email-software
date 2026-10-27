/**
 * WhatsApp Controller — HTTP Handlers for WhatsApp Marketing.
 */
import type { WhatsAppDispatchStartEvent, WhatsAppMessageMode } from '@saas/shared';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';

import { createError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';

import {
  buildRecipientList,
  createWhatsAppCampaign,
  createWhatsAppTemplate,
  deleteWhatsAppConfig,
  dispatchWhatsAppCampaign,
  getWhatsAppCampaignById,
  getWhatsAppCampaigns,
  getWhatsAppConfig,
  getEffectiveSenderMode,
  getWhatsAppTemplates,
  isSimulationAllowed,
  markCampaignFailed,
  prepareWhatsAppDispatch,
  saveWhatsAppConfig,
  syncWhatsAppTemplates,
  testWhatsAppConfig,
  type WhatsAppListInput,
} from './whatsapp.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadWhatsAppCsv = upload.single('file');

const HEARTBEAT_MS = 15_000;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** variableColumns arrives as a JSON string in multipart form data */
function parseVariableColumns(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === '') return undefined;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw createError.badRequest('variableColumns must be a JSON object');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createError.badRequest('variableColumns must be a JSON object');
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}

function listInput(req: Request): WhatsAppListInput {
  if (!req.file) throw createError.badRequest('Upload the recipients CSV or Excel file as "file".');
  return {
    file: { buffer: req.file.buffer, originalname: req.file.originalname },
    templateId: optionalString(req.body['templateId']),
    phoneColumn: optionalString(req.body['phoneColumn']),
    nameColumn: optionalString(req.body['nameColumn']),
    defaultCountryCode: optionalString(req.body['defaultCountryCode']),
    variableColumns: parseVariableColumns(req.body['variableColumns']),
  };
}

export class WhatsAppController {
  // GET /api/v1/whatsapp/config
  async getConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [config, effectiveSender] = await Promise.all([
        getWhatsAppConfig(req.user!.id),
        getEffectiveSenderMode(req.user!.id),
      ]);
      res.status(200).json({
        success: true,
        data: config,
        meta: { simulationAvailable: isSimulationAllowed(), effectiveSender },
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/v1/whatsapp/config
  async saveConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phoneNumberId, wabaId, accessToken } = req.body;
      if (typeof phoneNumberId !== 'string' || typeof accessToken !== 'string' || !phoneNumberId.trim() || !accessToken.trim()) {
        throw createError.badRequest('Phone Number ID and Access Token are required');
      }
      const config = await saveWhatsAppConfig(req.user!.id, {
        phoneNumberId,
        wabaId: typeof wabaId === 'string' ? wabaId : undefined,
        accessToken,
      });
      res.status(200).json({ success: true, data: config, message: 'Credentials saved. Use "Test Connection" to verify them with Meta.' });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/v1/whatsapp/config/test
  async testConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await testWhatsAppConfig(req.user!.id);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // DELETE /api/v1/whatsapp/config
  async deleteConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await deleteWhatsAppConfig(req.user!.id);
      res.status(200).json({ success: true, message: 'WhatsApp config deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/v1/whatsapp/campaigns
  async listCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaigns = await getWhatsAppCampaigns(req.user!.id);
      res.status(200).json({ success: true, data: campaigns });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/v1/whatsapp/campaigns/:id
  async getCampaignById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params['id'];
      const id = Array.isArray(idParam) ? idParam[0] : idParam;
      if (!id) throw createError.badRequest('Campaign ID is required');

      const campaign = await getWhatsAppCampaignById(id, req.user!.id);
      res.status(200).json({ success: true, data: campaign });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/v1/whatsapp/templates
  async listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const templates = await getWhatsAppTemplates(req.user!.id);
      res.status(200).json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/v1/whatsapp/templates — local draft (not submitted to Meta)
  async createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, category, language, bodyText } = req.body;
      if (typeof name !== 'string' || typeof bodyText !== 'string' || !name.trim() || !bodyText.trim()) {
        throw createError.badRequest('Template name and body text are required');
      }

      const template = await createWhatsAppTemplate(req.user!.id, {
        name: name.trim(),
        bodyText,
        ...(typeof category === 'string' && { category }),
        ...(typeof language === 'string' && { language }),
      });
      res.status(201).json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/v1/whatsapp/templates/sync
  async syncTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await syncWhatsAppTemplates(req.user!.id);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/v1/whatsapp/parse-preview — same builder the send endpoint uses
  async parsePreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { list } = await buildRecipientList(req.user!.id, listInput(req));
      const { sendable: _sendable, ...preview } = list;
      res.status(200).json({ success: true, data: preview });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/whatsapp/send (SSE)
   *
   * Everything that can be validated is validated before the stream opens, so
   * those errors come back as normal JSON 4xx/5xx responses. After the stream
   * opens, the protocol is:
   *   event: start | progress | complete | error
   * The client must treat a stream that ends without `complete` as interrupted.
   * Dispatch continues server-side if the client disconnects; results are
   * persisted and visible on the campaign page.
   */
  async send(req: Request, res: Response, next: NextFunction): Promise<void> {
    let prepared: Awaited<ReturnType<typeof prepareWhatsAppDispatch>>;
    let created: Awaited<ReturnType<typeof createWhatsAppCampaign>>;
    try {
      const templateId = optionalString(req.body['templateId']);
      const requestedMode = optionalString(req.body['messageMode']);
      const mode: WhatsAppMessageMode =
        requestedMode === 'text' || requestedMode === 'template' ? requestedMode : templateId ? 'template' : 'text';

      prepared = await prepareWhatsAppDispatch(req.user!.id, {
        ...listInput(req),
        title: optionalString(req.body['title']) ?? 'WhatsApp Campaign',
        mode,
        bodyText: optionalString(req.body['bodyText']),
      });
      created = await createWhatsAppCampaign(prepared);
    } catch (err) {
      next(err);
      return;
    }

    const { campaignId, recipients } = created;

    // ── SSE stream ──────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Bypass Nginx proxy buffering
    res.flushHeaders();

    let clientConnected = true;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientConnected = false;
        logger.info({ campaignId }, 'WhatsApp SSE client disconnected — dispatch continues in background');
      }
    });

    const write = (chunk: string) => {
      if (!clientConnected || res.writableEnded) return;
      res.write(chunk);
      const flushable = res as Response & { flush?: () => void };
      if (typeof flushable.flush === 'function') flushable.flush(); // compression middleware
    };
    const emit = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

    const start: WhatsAppDispatchStartEvent = {
      campaignId,
      total: recipients.length,
      title: prepared.title,
      isSimulation: prepared.sender.mode === 'simulation',
      skipped: { invalid: prepared.list.totalInvalid, duplicates: prepared.list.duplicateCount },
    };
    emit('start', start);

    try {
      const complete = await dispatchWhatsAppCampaign(prepared, campaignId, recipients, {
        progress: (data) => emit('progress', data),
      });
      emit('complete', complete);
    } catch (err) {
      logger.error({ err, campaignId }, 'WhatsApp dispatch crashed');
      const message = 'Dispatch stopped unexpectedly. Some messages may have been sent — check the campaign page before resending.';
      await markCampaignFailed(campaignId, message).catch(() => undefined);
      emit('error', { message, campaignId });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }
}
