import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isValidEmail, normalizeEmail, splitEmailCell } from '@saas/shared';
import * as XLSX from 'xlsx';

import { readSpreadsheet } from '../../lib/spreadsheet.js';

import { buildEmailRecipients } from './recipient-list.js';

const csv = (text: string) => readSpreadsheet(Buffer.from(text, 'utf-8'), 'list.csv');

describe('email normalization', () => {
  it('trims and lower-cases', () => {
    assert.equal(normalizeEmail('  Alice@Example.COM \t'), 'alice@example.com');
    assert.equal(normalizeEmail(undefined), '');
  });

  it('splits multi-address cells on commas and semicolons', () => {
    assert.deepEqual(splitEmailCell(' A@x.com, b@Y.com ;c@z.com,, '), ['a@x.com', 'b@y.com', 'c@z.com']);
  });

  it('validates format', () => {
    assert.equal(isValidEmail('a@b.co'), true);
    assert.equal(isValidEmail('not-an-email'), false);
    assert.equal(isValidEmail('a b@c.com'), false);
  });
});

describe('buildEmailRecipients', () => {
  it('skips duplicates case- and whitespace-insensitively, keeping the first row', () => {
    const sheet = csv('email,name\nalice@example.com,Alice\n  ALICE@example.com ,Alice 2\nbob@example.com,Bob\n');
    const result = buildEmailRecipients(sheet);

    assert.equal(result.recipients.length, 2);
    assert.deepEqual(result.recipients.map((r) => r.email), ['alice@example.com', 'bob@example.com']);
    assert.equal(result.recipients[0]!.name, 'Alice'); // first occurrence wins
    assert.deepEqual(result.duplicates, [{ email: 'alice@example.com', rowNumber: 3, firstSeenRow: 2 }]);

    const dup = result.preview.find((p) => p.status === 'duplicate')!;
    assert.equal(dup.valid, false, 'duplicates are not counted as sendable');
    assert.equal(dup.duplicateOfRow, 2);
  });

  it('reports invalid and missing addresses with row numbers', () => {
    const sheet = csv('email,name\nbad-address,X\n,Empty\nok@example.com,Ok\n');
    const result = buildEmailRecipients(sheet);

    assert.equal(result.invalidCount, 2);
    assert.equal(result.recipients.length, 1);
    const invalid = result.preview.filter((p) => p.status === 'invalid');
    assert.deepEqual(invalid.map((p) => [p.rowNumber, p.error]), [
      [2, 'Invalid email format'],
      [3, 'Email is missing'],
    ]);
  });

  it('expands multiple emails per cell and de-duplicates across them', () => {
    const sheet = csv('email,name\n"a@x.com, b@x.com",Team\nB@x.com,Bee\n');
    const result = buildEmailRecipients(sheet);

    assert.deepEqual(result.recipients.map((r) => r.email), ['a@x.com', 'b@x.com']);
    assert.equal(result.duplicates.length, 1);
    assert.equal(result.duplicates[0]!.rowNumber, 3);
  });

  it('keeps every column as a merge variable', () => {
    const sheet = csv('E-Mail,First_Name,Company\nann@x.com,Ann,Acme\n');
    const [r] = buildEmailRecipients(sheet).recipients;

    assert.equal(r!.email, 'ann@x.com');
    assert.equal(r!.name, 'Ann');
    assert.equal(r!.mergeData['company'], 'Acme');
    assert.equal(r!.mergeData['first_name'], 'Ann');
    assert.equal(r!.mergeData['name'], 'Ann');
  });

  it('returns no email column when the header is missing', () => {
    const result = buildEmailRecipients(csv('contact,name\nann@x.com,Ann\n'));
    assert.equal(result.emailColumn, null);
    assert.equal(result.recipients.length, 0);
  });
});

describe('readSpreadsheet', () => {
  it('keeps original row numbers when blank lines are skipped', () => {
    const sheet = csv('email\r\na@x.com\r\n\r\nb@x.com\r\n');
    assert.deepEqual(sheet.rows.map((r) => r.rowNumber), [2, 4]);
  });

  it('reads Excel with long numbers intact (no scientific notation)', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Email', 'Phone'],
      ['a@x.com', 919876543210],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const sheet = readSpreadsheet(buffer, 'list.xlsx');
    assert.deepEqual(sheet.headers, ['email', 'phone']);
    assert.equal(sheet.rows[0]!.values['phone'], '919876543210');
  });

  it('rejects unsupported file types', () => {
    assert.throws(() => readSpreadsheet(Buffer.from('x'), 'list.txt'), /Unsupported file type/);
  });
});
