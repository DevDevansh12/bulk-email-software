import { isValidEmail, normalizeEmail, type AudienceImportResult } from '@saas/shared';
import type { Request, Response } from 'express';
import multer from 'multer';

import { createError } from '../../lib/app-error.js';
import { readSpreadsheet } from '../../lib/spreadsheet.js';
import { buildEmailRecipients } from '../campaigns/recipient-list.js';

import * as AudiencesService from './audiences.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const audienceUploadMiddleware = upload.single('csv');

export class AudiencesController {
  list = async (req: Request, res: Response): Promise<void> => {
    const data = await AudiencesService.getAudiences(req.user!.id);
    res.status(200).json({ success: true, data });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw createError.badRequest('Audience name is required');
    }
    const data = await AudiencesService.createAudience(req.user!.id, { name: name.trim(), description });
    res.status(201).json({ success: true, data });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    const data = await AudiencesService.getAudienceById(id, req.user!.id);
    res.status(200).json({ success: true, data });
  };

  addContacts = async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;

    if (req.file) {
      // Same validation + de-duplication rules as campaign preview/send
      const sheet = readSpreadsheet(req.file.buffer, req.file.originalname);
      const list = buildEmailRecipients(sheet);
      if (!list.emailColumn) {
        throw createError.badRequest('Could not find an email column. Add a header such as "email" to the first row.');
      }
      const skippedRows: AudienceImportResult['skippedRows'] = list.preview
        .filter((p) => p.status !== 'valid')
        .map((p) => ({
          rowNumber: p.rowNumber,
          email: p.email,
          reason: p.status === 'duplicate' ? ('duplicate_in_file' as const) : ('invalid' as const),
        }));

      const data = await AudiencesService.addContactsToAudience(
        id,
        req.user!.id,
        list.recipients.map((r) => ({ email: r.email, name: r.name, rowNumber: r.rowNumber })),
        { invalid: list.invalidCount, duplicateInFile: list.duplicates.length, rows: skippedRows }
      );
      res.status(200).json({ success: true, data });
      return;
    }

    let rawEntries: { email?: unknown; name?: unknown }[] = [];
    if (Array.isArray(req.body['contacts'])) {
      rawEntries = req.body['contacts'];
    } else if (req.body['email']) {
      rawEntries = [{ email: req.body['email'], name: req.body['name'] }];
    }

    // Manual entries: normalize and de-duplicate exactly like file imports
    const seen = new Set<string>();
    const entries: AudiencesService.ContactImportEntry[] = [];
    const skippedRows: AudienceImportResult['skippedRows'] = [];
    let invalid = 0;
    let duplicateInFile = 0;
    rawEntries.forEach((c, idx) => {
      const email = normalizeEmail(c.email);
      const rowNumber = idx + 1;
      if (!isValidEmail(email)) {
        invalid++;
        skippedRows.push({ rowNumber, email, reason: 'invalid' });
      } else if (seen.has(email)) {
        duplicateInFile++;
        skippedRows.push({ rowNumber, email, reason: 'duplicate_in_file' });
      } else {
        seen.add(email);
        entries.push({ email, name: typeof c.name === 'string' ? c.name : undefined, rowNumber });
      }
    });

    const data = await AudiencesService.addContactsToAudience(id, req.user!.id, entries, {
      invalid,
      duplicateInFile,
      rows: skippedRows,
    });
    res.status(200).json({ success: true, data });
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    await AudiencesService.deleteAudience(id, req.user!.id);
    res.status(200).json({ success: true, data: { message: 'Audience deleted' } });
  };
}
