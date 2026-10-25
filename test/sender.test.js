'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkSender, parseVerifiedList, nameKey, idKey, editDistance, looksLikeMemberId } = require('../src/sender.js');

// Fake IDs for tests only.
const LIST = 'UFAKEMOTH1  Mothership\nUFAKETASK2  Task Poster\n# comment line\n\n';
const codes = (r) => r.flags.map((f) => f.code);
const check = (name, id, list = LIST, opts) => checkSender({ displayName: name, memberId: id }, list, opts);

test('parseVerifiedList: text, comments, separators, dedupe', () => {
  const l = parseVerifiedList('A1 one\nB2,two\nC3\tthree # note\n# x\nA1 dup\n');
  assert.deepEqual(l, [{ id: 'A1', label: 'one' }, { id: 'B2', label: 'two' }, { id: 'C3', label: 'three' }]);
});

test('parseVerifiedList: JSON and arrays', () => {
  assert.deepEqual(parseVerifiedList('["U1", {"id": "U2", "label": "x"}]'), [{ id: 'U1', label: '' }, { id: 'U2', label: 'x' }]);
  assert.deepEqual(parseVerifiedList([{ id: 'U3', name: 'y' }, null, 5]), [{ id: 'U3', label: 'y' }]);
  assert.throws(() => parseVerifiedList('[not json'), /does not parse/);
  assert.throws(() => parseVerifiedList({}), /must be an array/);
});

test('verified: exact member ID match', () => {
  const r = check('Mothership', 'UFAKEMOTH1');
  assert.equal(r.verdict, 'verified');
  assert.equal(r.match.label, 'Mothership');
  assert.deepEqual(codes(r), []);
});

test('verified ID with a different display name is still verified, with a note', () => {
  const r = check('Mama Ship', 'UFAKEMOTH1');
  assert.equal(r.verdict, 'verified');
  assert.deepEqual(codes(r), ['name.differs']);
});

test('verified ID using another verified account name gets a warning', () => {
  const r = check('Task Poster', 'UFAKEMOTH1');
  assert.equal(r.verdict, 'verified');
  assert.deepEqual(codes(r), ['name.other_label']);
});

test('copied display name with an unverified ID is impersonation', () => {
  const r = check('Mothership', 'UFAKE99999');
  assert.equal(r.verdict, 'suspicious');
  assert.ok(codes(r).includes('name.impersonation'));
  assert.match(r.flags.find((f) => f.code === 'name.impersonation').message, /UFAKEMOTH1/);
});

test('lookalike display names are caught', () => {
  for (const n of ['Mothershlp', 'M0thership', 'mothership_official', 'The Mothership', 'Mothrship', 'Task Poster HQ', 'Task-Poster', 'Ta5k P0ster']) {
    const r = check(n, 'UFAKE99999');
    assert.equal(r.verdict, 'suspicious', n);
  }
});

test('Cyrillic homoglyph name is caught and mixed script flagged', () => {
  const r = check('Mоthership', 'UFAKE99999'); // Cyrillic о
  assert.equal(r.verdict, 'suspicious');
  assert.ok(codes(r).includes('name.mixed_script'));
});

test('lookalike member IDs are caught (O/0, I/l/1, case, one-character edits)', () => {
  for (const id of ['UFAKEM0TH1', 'UFAKEMOTHI', 'ufakemoth1', 'UFAKEMOTH7', 'UFAKETA5K2']) {
    const r = check('random bot', id);
    assert.equal(r.verdict, 'suspicious', id);
    assert.ok(codes(r).includes('id.lookalike'), id);
  }
});

test('invisible characters in the ID make an exact match suspicious', () => {
  const r = check('Mothership', 'UFAKEMOTH1\u200B');
  assert.equal(r.verdict, 'suspicious');
  assert.ok(codes(r).includes('id.hidden_chars'));
  assert.equal(r.match, null);
});

test('invisible characters in the name are flagged', () => {
  const r = check('Moth\u200Dership', 'UFAKE99999');
  assert.ok(codes(r).includes('name.hidden_chars'));
  assert.equal(r.verdict, 'suspicious');
});

test('ordinary unknown sender is unverified, not suspicious', () => {
  const r = check('friendly-bot', 'UFAKE99999');
  assert.equal(r.verdict, 'unverified');
  assert.deepEqual(codes(r), ['id.unknown']);
});

test('missing member ID is invalid', () => {
  assert.equal(check('Mothership', '').verdict, 'invalid');
  assert.equal(check('Mothership', '   ').verdict, 'invalid');
  assert.equal(checkSender(null, LIST).verdict, 'invalid');
});

test('protected names are flagged even when not in the list', () => {
  assert.equal(check('Admin', 'UFAKE99999').verdict, 'suspicious');
  assert.equal(check('Swarm Moderator', 'UFAKE99999').verdict, 'suspicious');
  assert.equal(check('Captain', 'UFAKE99999', LIST, { protectedNames: ['captain'] }).verdict, 'suspicious');
});

test('empty verified list: protected name is a warning, not a verdict of safety', () => {
  const r = check('Mothership', 'UFAKE99999', '');
  assert.equal(r.verdict, 'unverified');
  assert.ok(codes(r).includes('name.unconfirmed'));
});

test('member ID format warning for display-name-like IDs', () => {
  const r = check('bob', 'bob the bot');
  assert.ok(codes(r).includes('id.format'));
  assert.ok(codes(r).includes('id.whitespace'));
  assert.equal(looksLikeMemberId('U01ABCDEF'), true);
  assert.equal(looksLikeMemberId('W0ABCDEFG'), true);
  assert.equal(looksLikeMemberId('mothership'), false);
});

test('helpers: nameKey, idKey, editDistance', () => {
  assert.equal(nameKey('M0THERSH1P'), nameKey('mothership'));
  assert.equal(nameKey('rnothership'), nameKey('mothership'));
  assert.equal(idKey('uO1l'), idKey('U011'));
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('ab', 'ba'), 1);
  assert.equal(editDistance('', 'abc'), 3);
});

test('large and hostile inputs stay fast', () => {
  const big = Array.from({ length: 5000 }, (_, i) => 'U' + String(i).padStart(30, '0') + ' ' + 'n'.repeat(60)).join('\n');
  const t0 = Date.now();
  checkSender({ displayName: 'm'.repeat(100000), memberId: 'U'.repeat(100000) }, big);
  checkSender({ displayName: '<img src=x onerror=alert(1)>', memberId: '"><script>' }, big);
  assert.ok(Date.now() - t0 < 3000, 'took ' + (Date.now() - t0) + 'ms');
});

test('messages say "looks like" for lookalikes and "same name" for copies', () => {
  const copy = check('Mothership', 'UFAKE99999').flags.find((f) => f.code === 'name.impersonation');
  assert.match(copy.message, /uses the same name as "Mothership"/);
  const look = check('Mothershlp', 'UFAKE99999').flags.find((f) => f.code === 'name.impersonation');
  assert.match(look.message, /looks like "Mothership"/);
});
