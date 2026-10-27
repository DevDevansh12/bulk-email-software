/**
 * Audiences Service — Subscriber Lists & Contacts Management.
 */
import type { Audience, AudienceContact, AudienceImportResult, CreateAudienceBody } from '@saas/shared';

import { supabaseAdmin } from '../../config/supabase.js';
import { createError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';

export async function getAudiences(userId: string): Promise<Audience[]> {
  const { data, error } = await supabaseAdmin
    .from('audiences')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw createError.badRequest('Failed to fetch audiences');
  }

  return (data || []).map(a => ({
    id: a.id,
    userId: a.user_id,
    name: a.name,
    description: a.description,
    contactCount: a.contact_count || 0,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  }));
}

export async function createAudience(userId: string, body: CreateAudienceBody): Promise<Audience> {
  const { data, error } = await supabaseAdmin
    .from('audiences')
    .insert({
      user_id: userId,
      name: body.name,
      description: body.description,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw createError.badRequest('Failed to create audience list');
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    description: data.description,
    contactCount: 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getAudienceById(audienceId: string, userId: string): Promise<{ audience: Audience; contacts: AudienceContact[] }> {
  const { data: audience, error: audErr } = await supabaseAdmin
    .from('audiences')
    .select('*')
    .eq('id', audienceId)
    .eq('user_id', userId)
    .single();

  if (audErr || !audience) {
    throw createError.notFound('Audience list not found');
  }

  const { data: contacts, error: conErr } = await supabaseAdmin
    .from('audience_contacts')
    .select('*')
    .eq('audience_id', audienceId)
    .order('created_at', { ascending: false });

  if (conErr) {
    throw createError.badRequest('Failed to fetch contacts');
  }

  return {
    audience: {
      id: audience.id,
      userId: audience.user_id,
      name: audience.name,
      description: audience.description,
      contactCount: audience.contact_count || 0,
      createdAt: audience.created_at,
      updatedAt: audience.updated_at,
    },
    contacts: (contacts || []).map(c => ({
      id: c.id,
      audienceId: c.audience_id,
      email: c.email,
      name: c.name,
      status: c.status,
      createdAt: c.created_at,
    })),
  };
}

export interface ContactImportEntry {
  /** Already normalized (trimmed, lower-cased) */
  email: string;
  name?: string | undefined;
  rowNumber: number;
}

const SKIPPED_ROWS_LIMIT = 200;
const EXISTING_LOOKUP_CHUNK = 200;

/**
 * Add contacts to one audience. Contacts already in THIS audience are left
 * unchanged (no cross-audience merging). Invalid and in-file duplicate entries
 * are counted by the caller (buildEmailRecipients) and passed through.
 */
export async function addContactsToAudience(
  audienceId: string,
  userId: string,
  entries: ContactImportEntry[],
  preSkipped: { invalid: number; duplicateInFile: number; rows: AudienceImportResult['skippedRows'] }
): Promise<AudienceImportResult> {
  // 1. Check ownership
  const { data: audience, error: audErr } = await supabaseAdmin
    .from('audiences')
    .select('id')
    .eq('id', audienceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (audErr) {
    logger.error({ dbError: audErr.message, audienceId }, 'Failed to load audience');
    throw createError.internal('Failed to load audience');
  }
  if (!audience) throw createError.notFound('Audience');

  if (entries.length === 0) {
    throw createError.badRequest(
      `No valid email contacts provided (${preSkipped.invalid} invalid, ${preSkipped.duplicateInFile} duplicate in file).`
    );
  }

  // 2. Find which addresses are already in this audience (emails are stored normalized)
  const existing = new Set<string>();
  for (let i = 0; i < entries.length; i += EXISTING_LOOKUP_CHUNK) {
    const chunk = entries.slice(i, i + EXISTING_LOOKUP_CHUNK).map((e) => e.email);
    const { data, error } = await supabaseAdmin
      .from('audience_contacts')
      .select('email')
      .eq('audience_id', audienceId)
      .in('email', chunk);
    if (error) {
      logger.error({ dbError: error.message, audienceId }, 'Failed to check existing contacts');
      throw createError.internal('Failed to check existing contacts. Nothing was imported.');
    }
    for (const row of data || []) existing.add(String(row.email).trim().toLowerCase());
  }

  const skippedRows = [...preSkipped.rows];
  const toInsert = entries.filter((e) => {
    if (!existing.has(e.email)) return true;
    skippedRows.push({ rowNumber: e.rowNumber, email: e.email, reason: 'already_exists' });
    return false;
  });

  // 3. Insert new contacts. The unique (audience_id, email) index from the
  //    reliability migration makes concurrent imports safe.
  let added = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500).map((c) => ({
      audience_id: audienceId,
      email: c.email,
      name: c.name?.trim() || null,
      status: 'subscribed',
    }));
    const { error } = await supabaseAdmin.from('audience_contacts').insert(chunk);
    if (error) {
      logger.error({ dbError: error.message, code: error.code, audienceId }, 'Failed to add contacts');
      throw createError.internal(
        error.code === '23505'
          ? `Import interrupted after adding ${added} contacts: another import added the same address at the same time. Re-run the import to add the rest.`
          : `Import interrupted after adding ${added} contacts. Re-run the import — existing contacts will be skipped.`
      );
    }
    added += chunk.length;
  }

  // 4. Recompute the stored count from the source of truth
  const { count, error: countErr } = await supabaseAdmin
    .from('audience_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('audience_id', audienceId);
  if (countErr) {
    logger.warn({ dbError: countErr.message, audienceId }, 'Failed to recount audience contacts');
  } else {
    await supabaseAdmin.from('audiences').update({ contact_count: count ?? 0 }).eq('id', audienceId);
  }

  return {
    added,
    alreadyExisting: entries.length - toInsert.length,
    invalid: preSkipped.invalid,
    duplicateInFile: preSkipped.duplicateInFile,
    skippedRows: skippedRows.slice(0, SKIPPED_ROWS_LIMIT),
    addedCount: added,
  };
}

export async function deleteAudience(audienceId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('audiences')
    .delete()
    .eq('id', audienceId)
    .eq('user_id', userId);

  if (error) {
    throw createError.badRequest('Failed to delete audience');
  }
}
