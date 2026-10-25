'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { STEPS, SKIP, STUCK, SECURITY_RULES, ASK } = require('../src/checklist.js');

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

test('Relay and Plug-in/PONG are filled in from the swarm and keep secrets in the private form', () => {
  for (const id of ['relay', 'plugin-pong']) {
    const s = STEPS.find((x) => x.id === id);
    assert.ok(s, id);
    assert.equal(s.todo, false);
    assert.doesNotMatch(s.title, /TODO/);
    assert.match(s.source, /Vee/);
  }
  const relay = STEPS.find((x) => x.id === 'relay').detail;
  assert.match(relay, /\/relay-setup/);
  assert.match(relay, /never into a channel, DM, or email/);
  assert.match(STEPS.find((x) => x.id === 'plugin-pong').detail, /U0CBX31KMS8/);
});

test('trusted-ID example file matches the IDs in the checklist', () => {
  const fs = require('node:fs');
  const txt = fs.readFileSync(require('node:path').join(__dirname, '..', 'examples', 'gigatron-trusted-ids.txt'), 'utf8');
  const all = JSON.stringify(STEPS);
  for (const id of ['U0CBX31KMS8', 'U0CBM2ATZ5Z', 'U0CBX59MY68']) {
    assert.ok(txt.includes(id), id);
    assert.ok(all.includes(id), id);
  }
});

test('confirmed steps cite their source', () => {
  for (const s of STEPS.filter((x) => !x.todo && x.id !== 'watch')) assert.match(s.source || '', /Vee/, s.id);
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

test('README checklist lists every step title and has no Relay/PONG placeholders', () => {
  const readme = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'README.md'), 'utf8').replace(/`/g, '');
  for (const s of STEPS) {
    assert.ok(readme.includes(s.title), 'README missing step: ' + s.title);
  }
  assert.doesNotMatch(readme, /TODO placeholder/);
});

test('speed-ping emoji and DAO thread location are filled in from Vee', () => {
  const sp = STEPS.find((x) => x.id === 'speed-pings');
  assert.equal(sp.todo, false);
  assert.match(sp.detail, /white_check_mark/);
  const dao = STEPS.find((x) => x.id === 'dao-votes');
  assert.equal(dao.todo, false);
  assert.match(dao.detail, /usually posted in #tasks/);
  assert.match(dao.detail, /member ID/);
  assert.equal(STEPS.filter((x) => x.todo).length, 0);
});

test('stuck points cover invite lag, Slack connect, /relay-setup, pasted secrets, missed PONG', () => {
  const all = JSON.stringify(STUCK).toLowerCase();
  for (const w of ['invite', 'connect slack', 'message box', 'private /relay-setup form', 'pong', 'error text only']) assert.ok(all.includes(w), w);
  assert.equal(/https?:\/\//.test(all), false);
});
