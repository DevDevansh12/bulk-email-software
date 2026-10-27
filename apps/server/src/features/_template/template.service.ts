/**
 * Service layer — business logic.
 *
 * RESPONSIBILITIES:
 * - Orchestrate business rules
 * - Call repositories / models
 * - Throw AppError for domain-level failures
 *
 * MUST NOT:
 * - Know about HTTP (no req/res)
 * - Return HTTP status codes
 * - Directly handle raw DB queries (delegate to repository)
 */
// import { TemplateRepository } from './template.repository.js';
// import { createError } from '../../lib/app-error.js';

export class TemplateService {
  // constructor(private readonly repo: TemplateRepository) {}
  //
  // async findAll(): Promise<TemplateDocument[]> {
  //   return this.repo.findAll();
  // }
  //
  // async findById(id: string): Promise<TemplateDocument> {
  //   const item = await this.repo.findById(id);
  //   if (!item) throw createError.notFound('Template');
  //   return item;
  // }
}
