import type { Request, Response } from 'express';
import * as AnalyticsService from './analytics.service.js';

export class AnalyticsController {
  overview = async (req: Request, res: Response): Promise<void> => {
    const data = await AnalyticsService.getAnalyticsOverview(req.user!.id);
    res.status(200).json({ success: true, data });
  };
}
