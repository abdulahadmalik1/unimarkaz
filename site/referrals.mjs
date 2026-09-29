#!/usr/bin/env node
// Offline referral accounting for accepted waitlist submissions. No network calls.
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const CODE = /^[A-Za-z0-9_-]{12,40}$/;
const FAILURE_STATUSES = new Set(['failed', 'failure', 'error', 'pending', 'rejected', 'spam', 'unconfirmed']);

function parseCsv(source) {
  const rows = [];
  let row = [], value = '', quoted = false, closed = false;
  const finishField = () => { row.push(value); value = ''; closed = false; };
  const finishRow = () => {
    finishField();
    if (row.some(cell => cell.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === ',') finishField();
    else if (char === '\n' || char === '\r') {
      finishRow();
      if (char === '\r' && source[i + 1] === '\n') i += 1;
    } else if (char === '"' && value === '' && !closed) quoted = true;
    else if (closed || char === '"') throw new Error('Malformed CSV quoting. Export the file again.');
    else value += char;
  }
  if (quoted) throw new Error('Unclosed CSV quote. Export the file again.');
  if (value !== '' || row.length || closed) finishRow();
  if (!rows.length) throw new Error('The CSV has no header.');
  const headers = rows.shift().map(header => header.trim().toLowerCase());
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) {
    throw new Error('CSV headers must be nonempty and unique.');
  }
  if (!headers.includes('email')) throw new Error('The CSV requires an email column.');
  return rows.map(cells => {
    if (cells.length > headers.length) return null;
    const record = Object.create(null);
    headers.forEach((header, index) => { record[header] = cells[index] ?? ''; });
    return record;
  });
}

export function parseSubmissions(source) {
  const text = source.replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('The input file is empty.');
  if (text.startsWith('[') || text.startsWith('{')) {
    let records;
    try { records = JSON.parse(text); }
    catch { throw new Error('Invalid JSON. Supply a JSON array or CSV export.'); }
    if (!Array.isArray(records)) throw new Error('JSON input must be an array of submission records.');
    return records;
  }
  return parseCsv(text);
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(email)) return null;
  if (email.slice(0, email.indexOf('@')).length > 64) return null;
  return email;
}

function readCode(record, field) {
  const candidates = [];
  if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
    if (typeof record[field] !== 'string') return null;
    candidates.push(record[field].trim());
  }
  if (typeof record.message === 'string') {
    for (const line of record.message.split(/\r?\n/)) {
      const marker = line.match(/^(referral_code|referred_by):[ \t]*(.*)$/i);
      if (marker?.[1].toLowerCase() === field && marker[2].trim()) candidates.push(marker[2].trim());
    }
  }
  // A contradictory field/message or repeated marker cannot establish ownership.
  if (!candidates.length || candidates.some(code => !CODE.test(code)) || new Set(candidates).size !== 1) return null;
  return candidates[0];
}

function submissionTime(record) {
  for (const field of ['submitted_at', 'created_at']) {
    const value = record[field];
    // Require an explicit timezone so results do not depend on the operator's computer.
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim())) continue;
    const timestamp = Date.parse(value.trim());
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function compareJoined(a, b) {
  if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  if (a.timestamp !== null && b.timestamp === null) return -1;
  if (a.timestamp === null && b.timestamp !== null) return 1;
  return a.order - b.order;
}

function explicitlyUnsuccessful(record) {
  if (record.success !== undefined && record.success !== null && record.success !== '') {
    if (![true, 1, 'true', '1'].includes(record.success)) return true;
  }
  return typeof record.status === 'string' && FAILURE_STATUSES.has(record.status.trim().toLowerCase());
}

export function rankReferrals(records) {
  if (!Array.isArray(records)) throw new Error('Expected an array of submission records.');
  let ignoredRows = 0;
  const rows = [];
  records.forEach((record, order) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || explicitlyUnsuccessful(record)) { ignoredRows += 1; return; }
    const email = normalizeEmail(record.email);
    if (!email) { ignoredRows += 1; return; }
    rows.push({email, order, timestamp: submissionTime(record), code: readCode(record, 'referral_code'), referrer: readCode(record, 'referred_by')});
  });
  rows.sort(compareJoined);
  const signups = new Map();
  const owners = new Map();
  for (const row of rows) {
    // The earliest accepted signup determines attribution; repeats cannot redirect it.
    if (!signups.has(row.email)) signups.set(row.email, {...row, qualifiedReferrals: 0});
    // Claim each code at its first accepted submission event, including aliases.
    // A later conflicting claim cannot steal the code or erase its owner's credit.
    // This relies on provider timestamps/export order and reviewed accepted records;
    // client-supplied codes alone do not prove email ownership or prevent fake signups.
    if (row.code && !owners.has(row.code)) owners.set(row.code, row.email);
  }
  let qualifiedReferrals = 0;
  for (const signup of signups.values()) {
    const ownerEmail = owners.get(signup.referrer);
    if (!ownerEmail || ownerEmail === signup.email) continue;
    signups.get(ownerEmail).qualifiedReferrals += 1;
    qualifiedReferrals += 1;
  }
  const ranked = [...signups.values()]
    .sort((a, b) => b.qualifiedReferrals - a.qualifiedReferrals || compareJoined(a, b))
    .map((signup, index) => ({
      rank: index + 1,
      email: signup.email,
      referral_code: signup.code && owners.get(signup.code) === signup.email ? signup.code : '',
      qualified_referrals: signup.qualifiedReferrals,
      joined_at: signup.timestamp === null ? '' : new Date(signup.timestamp).toISOString(),
      source_row: signup.order + 1,
    }));
  return {ranked, stats: {signups: ranked.length, qualifiedReferrals, ignoredRows, duplicateRows: rows.length - ranked.length}};
}

function csvCell(value) {
  let text = String(value);
  // Quoting alone does not prevent spreadsheet formula execution.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function rankingCsv(ranked) {
  const fields = ['rank', 'email', 'referral_code', 'qualified_referrals', 'joined_at', 'source_row'];
  return `${fields.map(csvCell).join(',')}\r\n${ranked.map(row => fields.map(field => csvCell(row[field])).join(',')).join('\r\n')}${ranked.length ? '\r\n' : ''}`;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node site/referrals.mjs --input accepted-signups.csv --output ranked-waitlist.csv\nAccepts CSV or a JSON array. Output must be a new file. See site/README.md for review and ranking rules.');
    return;
  }
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--output'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || options.has(args[i])) {
      throw new Error('Use --input <accepted-export> --output <new-csv-file>.');
    }
    options.set(args[i], args[i + 1]);
  }
  if (options.size !== 2) throw new Error('Both --input and --output are required.');
  let source;
  try { source = await readFile(resolve(options.get('--input')), 'utf8'); }
  catch (error) { throw new Error(`Cannot read input file (${error.code || 'read error'}).`); }
  const {ranked, stats} = rankReferrals(parseSubmissions(source));
  try { await writeFile(resolve(options.get('--output')), rankingCsv(ranked), {encoding: 'utf8', flag: 'wx', mode: 0o600}); }
  catch (error) { throw new Error(error.code === 'EEXIST' ? 'Output already exists. Choose a new output filename; no file was changed.' : `Cannot create output file (${error.code || 'write error'}).`); }
  console.log(`Ranking saved: ${stats.signups} unique signups; ${stats.qualifiedReferrals} qualifying referrals; ${stats.duplicateRows} duplicate rows; ${stats.ignoredRows} ignored rows.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
