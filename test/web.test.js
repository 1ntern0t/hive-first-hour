'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('../scripts/build-web.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');

test('docs/index.html is up to date (run npm run build:web)', () => {
  assert.equal(html, build());
});

test('static page has a strict CSP and no external requests', () => {
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
  assert.equal(/<(script|link|img|iframe|object|embed)[^>]+(src|href)\s*=/i.test(html), false);
  assert.equal(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts/.test(html), false);
  assert.equal(/https?:\/\//.test(html), false);
});

test('static page never uses innerHTML, outerHTML, insertAdjacentHTML, document.write or eval', () => {
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/.test(html), false);
});

test('localStorage is the only storage, under one key', () => {
  assert.equal(/sessionStorage|indexedDB|document\.cookie/.test(html), false);
  assert.match(html, /'hive-first-hour\/v1'/);
});

test('no donation or payment links', () => {
  assert.equal(/donat|paypal|ko-fi|patreon|buymeacoffee|sponsor/i.test(html), false);
});

test('inlined modules run in a browser-like global and match Node', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const ctx = {};
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(scripts[0], ctx);
  const node = require('../src/sender.js');
  const list = 'UFAKEMOTH1 Mothership';
  for (const [n, id] of [['Mothership', 'UFAKEMOTH1'], ['Mothershlp', 'UFAKE99999'], ['bob', 'UFAKEM0TH1'], ['bob', 'UFAKE99999']]) {
    const a = ctx.FirstHourSender.checkSender({ displayName: n, memberId: id }, list);
    const b = node.checkSender({ displayName: n, memberId: id }, list);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  }
  assert.equal(ctx.FirstHourChecklist.STEPS.length, require('../src/checklist.js').STEPS.length);
});
