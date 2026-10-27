/**
 * Spreadsheet reader shared by email campaigns, audiences, and WhatsApp.
 *
 * Returns lower-cased headers and rows tagged with their original 1-based row
 * number (header = row 1), so validation messages can point users at the exact
 * line in their file.
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

import { createError } from './app-error.js';

export interface SheetRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParsedSheet {
  type: 'csv' | 'excel';
  headers: string[];
  rows: SheetRow[];
}

export function getSpreadsheetType(filename: string): 'csv' | 'excel' | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  return null;
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? '' : cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

function toSheet(type: 'csv' | 'excel', matrix: unknown[][]): ParsedSheet {
  // First non-empty row is the header row
  const headerIdx = matrix.findIndex((row) => row.some((c) => cellToString(c) !== ''));
  if (headerIdx === -1) {
    throw createError.badRequest('The file has no data.');
  }

  const headers = (matrix[headerIdx] ?? []).map((h, i) => {
    const name = cellToString(h).replace(/^﻿/, '').toLowerCase();
    return name || `column_${i + 1}`;
  });

  const rows: SheetRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const raw = matrix[i] ?? [];
    const values: Record<string, string> = {};
    headers.forEach((h, idx) => {
      values[h] = cellToString(raw[idx]);
    });
    if (Object.values(values).every((v) => v === '')) continue; // skip blank lines
    rows.push({ rowNumber: i + 1, values });
  }

  return { type, headers, rows };
}

export function readSpreadsheet(buffer: Buffer, filename: string): ParsedSheet {
  const type = getSpreadsheetType(filename);
  if (!type) {
    throw createError.badRequest('Unsupported file type. Please upload a CSV or Excel (.xlsx, .xls) file.');
  }

  if (type === 'excel') {
    // cellDates: keep date cells readable for merge variables; raw numbers keep
    // long phone numbers from being rendered in scientific notation
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      throw createError.badRequest('Excel file is empty or has no sheets.');
    }
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
    return toSheet('excel', matrix);
  }

  const parsed = Papa.parse<string[]>(buffer.toString('utf-8'), { header: false, skipEmptyLines: false });
  return toSheet('csv', parsed.data);
}
