'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { STEPS, SKIP, SECURITY_RULES, ASK } = require('../src/checklist.js');

test('checklist has unique ids and covers the first hour in order', () => {
  const ids = STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  let last = -1;
  for (const s of STEPS) {
    const [a, b] = s.minutes.split('-').map(Number);
    assert.ok(a >= last && b > a, 'minutes increase: ' + s.id);
    last = b;
    assert.ok(s.title && s.detail);
  }
  assert.equal(Number(STEPS[0].minutes.split('-')[0]), 0);
  assert.equal(last, 60);
});

test('required topics are present', () => {
  const all = JSON.stringify(STEPS);
  for (const word of ['roll call', 'Mothership', 'member ID', 'speed ping', '#tasks', '+5', 'DONE', 'YES or NO', 'Relay', 'PONG']) {
    assert.ok(all.toLowerCase().includes(word.toLowerCase()), 'missing ' + word);
  }
});

test('every TODO step says to ask in #giga-build-team', () => {
  assert.equal(ASK, 'ask in #giga-build-team');
  for (const s of STEPS.filter((x) => x.todo)) assert.match(s.todoNote, /ask in #giga-build-team/);
});

test('Relay and Plug-in/PONG are marked as unverified TODO placeholders', () => {
  for (const id of ['relay', 'plugin-pong']) {
    const s = STEPS.find((x) => x.id === id);
    assert.ok(s, id);
    assert.equal(s.todo, true);
    assert.match(s.title, /TODO placeholder/);
  }
});

test('security rules cover keys, webhooks, seed phrases, files and owner approval', () => {
  const r = SECURITY_RULES.join(' ').toLowerCase();
  for (const w of ['keys', 'webhook', 'seed phrase', 'run files', 'owner', 'member id', 'no money']) assert.ok(r.includes(w), w);
  const skip = JSON.stringify(SKIP).toLowerCase();
  for (const w of ['bearer', 'webhook', 'wallet', 'files', 'verified list', 'approval']) assert.ok(skip.includes(w), w);
});

test('no donation or payment links anywhere in the checklist', () => {
  const all = JSON.stringify({ STEPS, SKIP, SECURITY_RULES });
  assert.equal(/https?:\/\//.test(all), false);
  assert.equal(/donat|paypal|ko-fi|patreon|buymeacoffee/i.test(all), false);
});

test('README checklist lists every step title and mentions TODO for Relay and PONG', () => {
  const readme = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'README.md'), 'utf8').replace(/`/g, '');
  for (const s of STEPS) {
    const t = s.title.replace(/ \(TODO placeholder\)$/, '');
    assert.ok(readme.includes(t), 'README missing step: ' + t);
  }
  assert.match(readme, /Relay \(TODO placeholder\)/);
  assert.match(readme, /Plug-in \/ PONG \(TODO placeholder\)/);
});
