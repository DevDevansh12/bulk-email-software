import { Router } from 'express';
import { TemplatesController } from './templates.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = Router();
const controller = new TemplatesController();

// All template routes require user authentication
router.use(authenticate);

router.get('/', controller.list);
router.post('/', controller.save);
router.delete('/:id', controller.remove);

export { router as templatesRouter };
