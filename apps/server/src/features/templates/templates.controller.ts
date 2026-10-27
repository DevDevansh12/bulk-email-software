import type { Request, Response } from 'express';
import { sendSuccess, sendCreated } from '../../lib/response.js';
import { TemplatesService } from './templates.service.js';

export class TemplatesController {
  list = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const templates = await TemplatesService.getTemplates(userId);
    sendSuccess(res, templates);
  };

  save = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const template = await TemplatesService.createOrUpdateTemplate(userId, req.body);
    sendCreated(res, template);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { id } = req.params;
    await TemplatesService.deleteTemplate(userId, id as string);
    sendSuccess(res, { success: true });
  };
}
