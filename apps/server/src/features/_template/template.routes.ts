/**
 * Feature router.
 *
 * Routes live close to the feature they belong to.
 * This file is the only place that wires HTTP verbs → controller methods.
 *
 * Middleware applied here is feature-scoped — won't affect other routes.
 */
import { Router } from 'express';
import { TemplateController } from './template.controller.js';

const controller = new TemplateController();
export const templateRouter = Router();

templateRouter.get('/', controller.getAll);
templateRouter.get('/:id', controller.getById);
templateRouter.post('/', controller.create);
templateRouter.patch('/:id', controller.update);
templateRouter.delete('/:id', controller.remove);
