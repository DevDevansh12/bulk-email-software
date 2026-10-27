/**
 * Controller layer — HTTP boundary.
 *
 * RESPONSIBILITIES:
 * - Parse and validate request inputs
 * - Call the service layer
 * - Format and send the HTTP response
 *
 * MUST NOT:
 * - Contain business logic
 * - Access the database directly
 * - Know about Mongoose models
 *
 * express-async-errors (imported in app.ts) automatically catches
 * thrown errors from async handlers and passes them to the error middleware.
 * No try/catch needed here.
 */
import type { Request, Response } from 'express';
import { sendSuccess, sendCreated, sendNoContent } from '../../lib/response.js';
// import { TemplateService } from './template.service.js';

export class TemplateController {
  // constructor(private readonly templateService: TemplateService) {}

  getAll = async (_req: Request, res: Response): Promise<void> => {
    // const items = await this.templateService.findAll();
    sendSuccess(res, []);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    // const item = await this.templateService.findById(id);
    sendSuccess(res, { id });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    // const item = await this.templateService.create(req.body);
    sendCreated(res, req.body);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    // const item = await this.templateService.update(id, req.body);
    sendSuccess(res, { id, ...req.body });
  };

  remove = async (_req: Request, res: Response): Promise<void> => {
    // await this.templateService.delete(req.params.id);
    sendNoContent(res);
  };
}
