'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { main } = require('../bin/firsthour.js');

const BIN = path.join(__dirname, '..', 'bin', 'firsthour.js');
const EXAMPLE = path.join(__dirname, '..', 'examples', 'verified-ids.example.txt');

function run(args) {
  let out = '', err = '';
  const code = main(args, { out: (s) => { out += s; }, err: (s) => { err += s; } });
  return { code, out, err };
}

test('default command prints the checklist and rules', () => {
  const r = run([]);
  assert.equal(r.code, 0);
  assert.match(r.out, /\[ \]  1\. \(0-5 min\) Join the Gigatron Slack/);
  assert.match(r.out, /Relay: create the webhook routine/);
  assert.doesNotMatch(r.out, /TODO:/);
  assert.match(r.out, /Security rules/);
});

test('checklist --json and --markdown', () => {
  const j = JSON.parse(run(['checklist', '--json']).out);
  assert.ok(j.steps.length >= 8 && j.skip.length && j.rules.length);
  assert.match(run(['checklist', '--markdown']).out, /^\| # \| Minutes \| Step \| Status \|/);
  assert.ok(JSON.parse(run(['rules', '--json']).out).rules.length);
  assert.match(run(['rules']).out, /Skip these/);
  assert.match(run(['rules']).out, /Common stuck points[\s\S]*\/relay-setup in the Slack message box/);
  assert.ok(JSON.parse(run(['rules', '--json']).out).stuck.length >= 5);
});

test('verify: exit codes 0 / 1 / 2', () => {
  assert.equal(run(['verify', '--name', 'Mothership', '--id', 'UEXAMPLE001', '--verified', EXAMPLE]).code, 0);
  assert.equal(run(['verify', '--name', 'helper', '--id', 'UOTHER9999', '--verified', EXAMPLE]).code, 1);
  const bad = run(['verify', '--name', 'Mothership', '--id', 'UOTHER9999', '--verified', EXAMPLE]);
  assert.equal(bad.code, 2);
  assert.match(bad.out, /SUSPICIOUS/);
  assert.equal(run(['verify', '--name', 'x', '--id', 'UEXAMPLEOO1', '--verified', EXAMPLE]).code, 2);
  assert.equal(run(['verify', '--name', 'Mothership', '--id', '', '--verified', EXAMPLE]).code, 2);
});

test('verify --json and --flag=value form', () => {
  const r = run(['verify', '--name=Task Poster', '--id=UEXAMPLE002', '--verified=' + EXAMPLE, '--json']);
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.out).verdict, 'verified');
});

test('verify with a JSON verified list and --protected', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fh-')), 'ids.json');
  fs.writeFileSync(f, JSON.stringify([{ id: 'UFAKE00001', label: 'Captain' }]));
  assert.equal(run(['verify', '--name', 'Captain', '--id', 'UFAKE00001', '--verified', f]).code, 0);
  assert.equal(run(['verify', '--name', 'Kaptain', '--id', 'UFAKE00002', '--verified', f, '--protected', 'kaptain']).code, 2);
});

test('usage errors exit 64', () => {
  assert.equal(run(['verify', '--id', 'U1']).code, 64);
  assert.equal(run(['verify', '--verified', EXAMPLE]).code, 64);
  assert.equal(run(['verify', '--id', 'U1', '--verified', '/nonexistent/file']).code, 64);
  assert.equal(run(['nope']).code, 64);
  assert.equal(run(['verify', '--id']).code, 64);
  assert.match(run(['--help']).out, /Usage:/);
  assert.match(run(['--version']).out, /^\d+\.\d+\.\d+\n$/);
});

test('real process: exit status and stdout', () => {
  const r = spawnSync(process.execPath, [BIN, 'verify', '--name', 'Mothershlp', '--id', 'UOTHER9999', '--verified', EXAMPLE], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /impersonation/);
  const ok = spawnSync(process.execPath, [BIN], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
});

test('unknown options are rejected instead of silently ignored', () => {
  const r = run(['verify', '--nmae', 'Mothership', '--id', 'U0CBX31KMS8', '--verified', EXAMPLE]);
  assert.equal(r.code, 64);
  assert.match(r.err, /unknown option --nmae/);
  assert.equal(run(['--jsn']).code, 64);
});

test('verify refuses a verified-ID file larger than 1 MB', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-big-'));
  const big = path.join(dir, 'ids.txt');
  fs.writeFileSync(big, 'U0123456789 x\n'.repeat(80000));
  const r = run(['verify', '--name', 'x', '--id', 'U0123456789', '--verified', big]);
  assert.equal(r.code, 64);
  assert.match(r.err, /larger than 1 MB/);
  fs.rmSync(dir, { recursive: true, force: true });
});
