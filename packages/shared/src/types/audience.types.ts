export type ContactStatus = 'subscribed' | 'unsubscribed' | 'bounced';

export interface AudienceContact {
  id: string;
  audienceId: string;
  email: string;
  name?: string;
  status: ContactStatus;
  createdAt: string;
}

export interface Audience {
  id: string;
  userId: string;
  name: string;
  description?: string;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAudienceBody {
  name: string;
  description?: string;
}

export interface AddContactBody {
  email: string;
  name?: string;
}

/** Outcome of adding contacts to an audience (CSV import or manual add). */
export interface AudienceImportResult {
  /** New contacts inserted */
  added: number;
  /** Already in this audience before the import (left unchanged) */
  alreadyExisting: number;
  /** Missing or malformed email addresses */
  invalid: number;
  /** Repeated within the uploaded file (only the first occurrence is used) */
  duplicateInFile: number;
  /** Row-level details for skipped entries (capped to keep responses small) */
  skippedRows: { rowNumber: number; email: string; reason: 'invalid' | 'duplicate_in_file' | 'already_exists' }[];
  /** @deprecated use `added` — kept for older clients */
  addedCount: number;
}
