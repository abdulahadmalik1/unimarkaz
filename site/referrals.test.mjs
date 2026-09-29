import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm, rmdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseSubmissions, rankReferrals, rankingCsv} from './referrals.mjs';

const A = 'aaaaaaaaaaaa1111', B = 'bbbbbbbbbbbb2222', C = 'cccccccccccc3333';
const row = (email, code, referrer = '', extra = {}) => ({email, referral_code: code, referred_by: referrer, ...extra});

test('normalizes email and credits a distinct signup once, preserving earliest attribution', () => {
  const result = rankReferrals([
    row('other@example.com', C),
    row(' Founder@Example.com ', A),
    row('friend@example.com', B, A),
    row('FRIEND@example.com', 'duplicatecode123', C),
    row('founder@example.com', 'founderalias1234', B),
  ]);
  assert.equal(result.ranked[0].email, 'founder@example.com');
  assert.equal(result.ranked[0].qualified_referrals, 1);
  assert.equal(result.ranked.find(value => value.email === 'other@example.com').qualified_referrals, 0);
  assert.deepEqual(result.stats, {signups: 3, qualifiedReferrals: 1, ignoredRows: 0, duplicateRows: 2});
});

test('same-email aliases work, self referrals do not, and later claims cannot erase ownership', () => {
  const result = rankReferrals([
    row('self@example.com', A, B),
    row('self@example.com', B),
    row('friend@example.com', C, B),
    row('original@example.com', 'sharedcode12345'),
    row('claimant@example.com', 'sharedcode12345'),
    row('referred@example.com', 'anothercode12345', 'sharedcode12345'),
  ]);
  assert.equal(result.ranked[0].email, 'self@example.com');
  assert.equal(result.ranked[0].qualified_referrals, 1);
  assert.equal(result.stats.qualifiedReferrals, 2);
  const original = result.ranked.find(value => value.email === 'original@example.com');
  const claimant = result.ranked.find(value => value.email === 'claimant@example.com');
  assert.equal(original.referral_code, 'sharedcode12345');
  assert.equal(original.qualified_referrals, 1);
  assert.equal(claimant.referral_code, '');
  assert.equal(claimant.qualified_referrals, 0);
});

test('code ownership uses each claim event, not the claimant earliest signup or export position', () => {
  const at = hour => ({submitted_at: `2026-09-29T${String(hour).padStart(2, '0')}:00:00Z`});
  const result = rankReferrals([
    row('claimant@example.com', A, '', at(4)),
    row('alias-friend@example.com', 'aliasfriendcode1', B, at(7)),
    row('owner@example.com', B, '', at(5)),
    row('claimant@example.com', B, '', at(6)),
    row('claimant@example.com', C, '', at(1)),
    row('first-friend@example.com', 'firstfriendcode1', A, at(3)),
    row('owner@example.com', A, '', at(2)),
    row('new-claimant@example.com', A, '', at(8)),
  ]);
  const owner = result.ranked.find(value => value.email === 'owner@example.com');
  const claimant = result.ranked.find(value => value.email === 'claimant@example.com');
  assert.equal(owner.rank, 1);
  assert.equal(owner.referral_code, A);
  assert.equal(owner.qualified_referrals, 2);
  assert.equal(claimant.referral_code, C);
  assert.equal(claimant.qualified_referrals, 0);
  assert.equal(result.ranked.find(value => value.email === 'new-claimant@example.com').referral_code, '');
  assert.equal(result.stats.qualifiedReferrals, 2);
});

test('earliest timestamp owns duplicate attribution; ties and absent dates retain export order', () => {
  const result = rankReferrals([
    row('late@example.com', C, '', {submitted_at: '2026-09-30T00:00:00Z'}),
    row('repeat@example.com', 'repeatedcode1234', A, {submitted_at: '2026-09-30T00:00:00Z'}),
    row('first@example.com', A, '', {created_at: '2026-09-29T08:00:00+05:00'}),
    row('repeat@example.com', B, '', {submitted_at: '2026-09-29T03:00:00Z'}),
    row('undated@example.com', 'undatedcode12345'),
    row('unqualified@example.com', 'notimezone123456', '', {submitted_at: '2026-09-01T00:00:00'}),
  ]);
  assert.deepEqual(result.ranked.map(value => value.email), ['first@example.com', 'repeat@example.com', 'late@example.com', 'undated@example.com', 'unqualified@example.com']);
  assert.equal(result.stats.qualifiedReferrals, 0);
  assert.equal(result.ranked[0].joined_at, '2026-09-29T03:00:00.000Z');
});

test('message fallback supports direct fields but rejects contradictions and invalid codes', () => {
  const result = rankReferrals([
    {email: 'owner@example.com', message: `UniMarkaz waitlist.\nreferral_code: ${A}\nreferred_by: `},
    {email: 'friend@example.com', message: `referral_code: ${B}\nreferred_by: ${A}`},
    {email: 'conflict@example.com', referred_by: B, message: `referred_by: ${A}`},
    {email: 'markers@example.com', message: `referred_by: ${A}\nreferred_by: ${B}`},
    {email: 'invalid@example.com', referral_code: 'bad', referred_by: 'bad'},
    {email: 'empty@example.com', referred_by: '', message: `referred_by: ${A}`},
  ]);
  assert.equal(result.ranked[0].qualified_referrals, 2);
  assert.equal(result.stats.qualifiedReferrals, 2);
});

test('ignores unsupported and unsuccessful rows while retaining no-JavaScript signups', () => {
  const result = rankReferrals([
    null, [], 'invalid', {}, {email: 'not-an-email'}, {email: 'a\n@example.com'},
    row('failed@example.com', A, '', {success: false}),
    row('pending@example.com', A, '', {status: 'pending'}),
    {email: 'native@example.com'}, {email: 'accepted@example.com', success: 'true'},
  ]);
  assert.equal(result.stats.ignoredRows, 8);
  assert.equal(result.stats.signups, 2);
});

test('reads BOM, escaped CSV fields and multiline messages; rejects malformed input', () => {
  const records = parseSubmissions(`\uFEFFemail,referral_code,message\r\nowner@example.com,${A},"A message, with ""quotes"""\r\nfriend@example.com,,"referral_code: ${B}\nreferred_by: ${A}"\r\n`);
  assert.equal(records[0].message, 'A message, with "quotes"');
  assert.equal(rankReferrals(records).stats.qualifiedReferrals, 1);
  assert.equal(rankReferrals(parseSubmissions('email,referral_code\na@example.com\nb@example.com,code,extra')).stats.ignoredRows, 1);
  assert.throws(() => parseSubmissions('email,email\na@example.com,b@example.com'), /unique/);
  assert.throws(() => parseSubmissions('email,message\na@example.com,"unclosed'), /Unclosed/);
  assert.throws(() => parseSubmissions('email,message\na@example.com,"closed"junk'), /Malformed/);
  assert.throws(() => parseSubmissions('{"email":"a@example.com"}'), /array/);
  assert.throws(() => parseSubmissions('['), /Invalid JSON/);
  assert.deepEqual(parseSubmissions('[]'), []);
});

test('CSV neutralizes formula-like email addresses and quotes embedded delimiters', () => {
  const csv = rankingCsv(rankReferrals([
    {email: '=example@example.com'}, {email: '+example@example.com'}, {email: '-example@example.com'},
  ]).ranked);
  assert.ok(csv.includes('"\'=example@example.com"'));
  assert.ok(csv.includes('"\'+example@example.com"'));
  assert.ok(csv.includes('"\'-example@example.com"'));
  assert.ok(csv.endsWith('\r\n'));
});

test('CLI writes only to a new explicit file and never prints subscriber emails', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'unimarkaz-referrals-'));
  try {
    const input = join(folder, 'input.json'), output = join(folder, 'ranking.csv');
    await writeFile(input, JSON.stringify([row('private@example.com', A)]));
    const cli = fileURLToPath(new URL('./referrals.mjs', import.meta.url));
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8'});
    assert.equal(run('--input', input).status, 1);
    const result = run('--input', input, '--output', output);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 unique signups/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('private@example.com'));
    const saved = await readFile(output, 'utf8');
    assert.match(saved, /private@example.com/);
    const repeat = run('--input', input, '--output', output);
    assert.equal(repeat.status, 1);
    assert.match(repeat.stderr, /already exists/);
    assert.equal(await readFile(output, 'utf8'), saved);
  } finally {
    await rm(join(folder, 'input.json'), {force: true});
    await rm(join(folder, 'ranking.csv'), {force: true});
    await rmdir(folder);
  }
});
