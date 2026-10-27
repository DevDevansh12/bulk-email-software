/**
 * Campaigns controller — CSV upload + bulk email sending.
 * Uses multer for file upload and SSE for streaming progress.
 */
import type { CampaignCreateResult } from '@saas/shared';
import type { Request, Response } from 'express';
import multer from 'multer';

import { createError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';

import * as CampaignsService from './campaigns.service.js';
import { validateCampaign } from './campaigns.validation.js';

// ── Multer config ─────────────────────────────────────────────────────────────
// Store in memory (don't write to disk) — CSV is parsed immediately
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 6, // 1 CSV + 5 attachments
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'csv') {
      if (
        file.mimetype === 'text/csv' ||
        file.originalname.endsWith('.csv') ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')
      ) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV or Excel files are allowed for recipients list'));
      }
    } else {
      // Allow any file type for attachments
      cb(null, true);
    }
  },
});

export const uploadMiddleware = upload.fields([
  { name: 'csv', maxCount: 1 },
  { name: 'attachments', maxCount: 5 }
]);

// ── Controller ────────────────────────────────────────────────────────────────

export class CampaignsController {
  
  list = async (req: Request, res: Response): Promise<void> => {
    const page = parseInt((req.query['page'] as string) || '1', 10);
    const limit = parseInt((req.query['limit'] as string) || '10', 10);
    
    const { campaigns, total } = await CampaignsService.getCampaigns(req.user!.id, page, limit);
    
    res.status(200).json({
      success: true,
      data: campaigns,
      meta: {
        pagination: { page, limit, total }
      }
    });
  };

  stats = async (req: Request, res: Response): Promise<void> => {
    const data = await CampaignsService.getDashboardStats(req.user!.id);
    res.status(200).json({ success: true, data });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const campaignId = req.params['id'] as string;
    if (!campaignId) {
      throw createError.badRequest('Campaign ID is required');
    }
    const data = await CampaignsService.getCampaignById(campaignId, req.user!.id);
    res.status(200).json({ success: true, data });
  };

  parsePreview = async (req: Request, res: Response): Promise<void> => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const csvFile = files?.['csv']?.[0];

    if (!csvFile) {
      throw createError.badRequest('File is required. Upload as "csv" field in multipart/form-data.');
    }
    
    const data = CampaignsService.parseFilePreview(csvFile.buffer, csvFile.originalname, csvFile.size);
    res.status(200).json({ success: true, data });
  };

  /**
   * POST /campaigns/send
   * Body: { subject, fromName, body } + CSV/Excel file as multipart/form-data
   * Returns: JSON immediately — sending happens in the background via headless sender.
   * The file is re-validated and de-duplicated here; the client preview is not trusted.
   */
  send = async (req: Request, res: Response): Promise<void> => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const csvFile = files?.['csv']?.[0];
    const attachmentFiles = files?.['attachments'] || [];

    // Validate campaign payload
    const payload = validateCampaign({
      subject: req.body['subject'],
      fromName: req.body['fromName'],
      body: req.body['body'],
    });

    // Check file was uploaded
    if (!csvFile) {
      throw createError.badRequest('CSV file is required. Upload as "csv" field in multipart/form-data.');
    }

    const { recipients, skipped } = CampaignsService.parseRecipientsForSend(csvFile.buffer, csvFile.originalname);
    const attachments = toAttachments(attachmentFiles);

    const userId = req.user!.id;
    const { campaignId } = await CampaignsService.createCampaign(userId, { ...payload, attachments }, recipients);

    // Fire headless send in the background (fire-and-forget). It records its own
    // failures on the campaign; this catch only guards against unexpected crashes.
    CampaignsService.sendCampaignHeadless(campaignId, userId).catch((err) => {
      logger.error({ err, campaignId }, 'Background send failed unexpectedly');
    });

    const result: CampaignCreateResult = {
      campaignId,
      recipientCount: recipients.length,
      skipped,
      message: 'Campaign initiated! Emails are being sent in the background.',
    };
    res.status(201).json({ success: true, data: result });
  };

  /**
   * POST /campaigns/schedule
   * Body: { subject, fromName, body, scheduledAt } + CSV file as multipart/form-data
   * Returns: JSON { campaignId, scheduledAt } — no SSE (sending is deferred to cron)
   */
  schedule = async (req: Request, res: Response): Promise<void> => {
    const scheduledAt = req.body['scheduledAt'] as string;

    if (!scheduledAt) {
      throw createError.badRequest('scheduledAt is required (ISO 8601 datetime string).');
    }

    // Validate it's a future datetime
    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      throw createError.badRequest('scheduledAt must be a valid future datetime.');
    }

    const payload = validateCampaign({
      subject: req.body['subject'],
      fromName: req.body['fromName'],
      body: req.body['body'],
    });

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const csvFile = files?.['csv']?.[0];
    const attachmentFiles = files?.['attachments'] || [];

    if (!csvFile) {
      throw createError.badRequest('CSV file is required. Upload as "csv" field in multipart/form-data.');
    }

    const { recipients, skipped } = CampaignsService.parseRecipientsForSend(csvFile.buffer, csvFile.originalname);

    // Attachments are stored as base64 in the DB until the cron sends them
    const attachments = toAttachments(attachmentFiles);

    const { campaignId } = await CampaignsService.createCampaign(
      req.user!.id,
      { ...payload, attachments },
      recipients,
      scheduledDate.toISOString()
    );

    const result: CampaignCreateResult = {
      campaignId,
      scheduledAt: scheduledDate.toISOString(),
      recipientCount: recipients.length,
      skipped,
      message: `Campaign scheduled for ${scheduledDate.toISOString()}`,
    };
    res.status(201).json({ success: true, data: result });
  };
}

/** Map uploaded files to Nodemailer attachments (base64 so they can be stored for scheduled sends). */
function toAttachments(files: Express.Multer.File[]) {
  return files.map((file) => ({
    filename: file.originalname,
    content: file.buffer.toString('base64'),
    contentType: file.mimetype,
    encoding: 'base64',
  }));
}
