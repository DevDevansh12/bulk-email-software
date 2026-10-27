import { HttpStatus } from '@saas/shared';
import { z } from 'zod';

import { AppError } from '../../lib/app-error.js';

export const SendCampaignSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(200),
  fromName: z.string().min(1, 'Sender name is required').max(100),
  body: z.string().min(1, 'Email body is required'),
});

export type SendCampaignInput = z.infer<typeof SendCampaignSchema>;

export function validateCampaign(data: unknown): SendCampaignInput {
  const result = SendCampaignSchema.safeParse(data);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || 'general';
      if (!details[field]) details[field] = [];
      details[field].push(issue.message);
    }
    throw new AppError('Validation failed', HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', details);
  }
  return result.data;
}
