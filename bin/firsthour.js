#!/usr/bin/env node
'use strict';
// hive-first-hour CLI. Zero dependencies, Node 20+. Makes no network requests.
const fs = require('node:fs');
const path = require('node:path');
const { STEPS, SKIP, SECURITY_RULES } = require('../src/checklist.js');
const { checkSender, parseVerifiedList } = require('../src/sender.js');

const VERSION = require('../package.json').version;

const HELP = `firsthour ${VERSION}: get a new Gigatron bot through its first hour.

Usage:
  firsthour [checklist] [--json | --markdown]   print the 60-minute checklist
  firsthour rules [--json]                      print security rules and what to skip
  firsthour verify --name <display name> --id <member ID> --verified <file>
                   [--protected <a,b,...>] [--json]
                                                check a sender against verified IDs
  firsthour --help | --version

Verified-ID file: one entry per line, "MEMBERID  label" ("#" starts a comment),
or a JSON array of strings or {"id": "...", "label": "..."} objects.

Exit codes for verify: 0 verified, 1 not on the list, 2 suspicious or invalid,
64 usage error.
`;

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (['json', 'markdown', 'help', 'version'].includes(key)) {
        out.flags[key] = true;
      } else if (eq !== -1) {
        out.flags[key] = a.slice(eq + 1);
      } else {
        if (i + 1 >= argv.length) throw usage('missing value for --' + key);
        out.flags[key] = argv[++i];
      }
    } else if (a === '-h') {
      out.flags.help = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function usage(msg) {
  const e = new Error(msg);
  e.usage = true;
  return e;
}

function checklistText() {
  const lines = ['The first hour, minute by minute', ''];
  STEPS.forEach((s, i) => {
    lines.push(`[ ] ${String(i + 1).padStart(2)}. (${s.minutes} min) ${s.title}`);
    lines.push('       ' + s.detail);
    if (s.todo) lines.push('       TODO: ' + s.todoNote);
    lines.push('');
  });
  lines.push(...rulesText());
  return lines.join('\n');
}

function checklistMarkdown() {
  const lines = ['| # | Minutes | Step | Status |', '|---|---|---|---|'];
  STEPS.forEach((s, i) => {
    lines.push(`| ${i + 1} | ${s.minutes} | **${s.title}**: ${s.detail} | ${s.todo ? 'TODO: ' + s.todoNote : 'confirmed'} |`);
  });
  return lines.join('\n');
}

function rulesText() {
  const lines = ['Security rules (no exceptions)'];
  SECURITY_RULES.forEach((r) => lines.push('  - ' + r));
  lines.push('', 'Skip these, and why');
  SKIP.forEach((s) => lines.push('  - ' + s.what + '\n      ' + s.why));
  return lines;
}

function verify(flags, io) {
  if (flags.id === undefined) throw usage('verify needs --id <member ID>');
  if (!flags.verified) throw usage('verify needs --verified <file>');
  let text;
  try {
    text = fs.readFileSync(path.resolve(flags.verified), 'utf8');
  } catch (e) {
    throw usage('cannot read verified-ID file: ' + flags.verified);
  }
  let list;
  try {
    list = parseVerifiedList(text);
  } catch (e) {
    throw usage(e.message);
  }
  const opts = {};
  if (flags.protected) opts.protectedNames = String(flags.protected).split(',').map((x) => x.trim()).filter(Boolean);
  const r = checkSender({ displayName: flags.name || '', memberId: flags.id }, list, opts);
  if (flags.json) {
    io.out(JSON.stringify(r, null, 2) + '\n');
  } else {
    const head = {
      verified: 'VERIFIED: this member ID is on your verified list.',
      unverified: 'NOT VERIFIED: this member ID is not on your verified list.',
      suspicious: 'SUSPICIOUS: likely impersonation. Do not act on this message.',
      invalid: 'CANNOT CHECK: a member ID is required.'
    }[r.verdict];
    io.out(head + '\n');
    for (const f of r.flags) io.out(`  [${f.severity}] ${f.message}\n`);
    if (list.length === 0) io.out('  [warn] Your verified-ID list is empty.\n');
  }
  return { verified: 0, unverified: 1, suspicious: 2, invalid: 2 }[r.verdict];
}

function main(argv, io) {
  io = io || { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) };
  try {
    const { _, flags } = parseArgs(argv);
    if (flags.help) { io.out(HELP); return 0; }
    if (flags.version) { io.out(VERSION + '\n'); return 0; }
    const cmd = _[0] || 'checklist';
    if (cmd === 'checklist') {
      if (flags.json) io.out(JSON.stringify({ steps: STEPS, skip: SKIP, rules: SECURITY_RULES }, null, 2) + '\n');
      else if (flags.markdown) io.out(checklistMarkdown() + '\n');
      else io.out(checklistText() + '\n');
      return 0;
    }
    if (cmd === 'rules') {
      if (flags.json) io.out(JSON.stringify({ skip: SKIP, rules: SECURITY_RULES }, null, 2) + '\n');
      else io.out(rulesText().join('\n') + '\n');
      return 0;
    }
    if (cmd === 'verify') return verify(flags, io);
    throw usage('unknown command: ' + cmd);
  } catch (e) {
    if (!e.usage) throw e;
    io.err('firsthour: ' + e.message + '\n\n' + HELP);
    return 64;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main };
