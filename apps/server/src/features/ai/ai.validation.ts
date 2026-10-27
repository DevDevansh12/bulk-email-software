import { z } from 'zod';
import { AppError } from '../../lib/app-error.js';
import { HttpStatus } from '@saas/shared';

export const ParaphraseSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  tone: z.string().min(1, 'Tone is required'),
});

export type ParaphraseInput = z.infer<typeof ParaphraseSchema>;

export function validateParaphrase(data: unknown): ParaphraseInput {
  const result = ParaphraseSchema.safeParse(data);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || 'general';
      if (!details[field]) details[field] = [];
      details[field]!.push(issue.message);
    }
    throw new AppError('Validation failed', HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', details);
  }
  return result.data;
}
