import { supabaseAdmin } from '../../config/supabase.js';
import { logger } from '../../lib/logger.js';
import { createError } from '../../lib/app-error.js';

export interface EmailTemplatePayload {
  id?: string;
  name: string;
  subject: string;
  body: string;
}

export class TemplatesService {
  static async getTemplates(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch email templates');
      throw createError.badRequest('Failed to fetch email templates');
    }

    return data || [];
  }

  static async createOrUpdateTemplate(userId: string, payload: EmailTemplatePayload) {
    if (!payload.name?.trim() || !payload.subject?.trim() || !payload.body?.trim()) {
      throw createError.badRequest('Template name, subject, and body are required');
    }

    const templateData = {
      user_id: userId,
      name: payload.name.trim(),
      subject: payload.subject.trim(),
      body: payload.body,
      updated_at: new Date().toISOString()
    };

    if (payload.id) {
      // Update existing
      const { data, error } = await supabaseAdmin
        .from('email_templates')
        .update(templateData)
        .eq('id', payload.id)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        logger.error({ error, userId, templateId: payload.id }, 'Failed to update email template');
        throw createError.badRequest('Failed to update email template');
      }

      return data;
    } else {
      // Insert new
      const { data, error } = await supabaseAdmin
        .from('email_templates')
        .insert({
          ...templateData,
          created_at: new Date().toISOString()
        })
        .select('*')
        .single();

      if (error) {
        logger.error({ error, userId }, 'Failed to create email template');
        throw createError.badRequest('Failed to create email template');
      }

      return data;
    }
  }

  static async deleteTemplate(userId: string, templateId: string) {
    if (!templateId) {
      throw createError.badRequest('Template ID is required');
    }

    const { error } = await supabaseAdmin
      .from('email_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error, userId, templateId }, 'Failed to delete email template');
      throw createError.badRequest('Failed to delete email template');
    }

    return true;
  }
}
