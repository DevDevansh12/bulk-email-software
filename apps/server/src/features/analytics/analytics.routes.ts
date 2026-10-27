import { Router } from 'express';
import { AnalyticsController } from './analytics.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = Router();
const controller = new AnalyticsController();

router.use(authenticate);
router.get('/overview', controller.overview);

export { router as analyticsRouter };
