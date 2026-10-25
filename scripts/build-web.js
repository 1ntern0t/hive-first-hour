#!/usr/bin/env node
'use strict';
// Inlines src/checklist.js + src/sender.js into web/index.template.html and
// writes docs/index.html (one self-contained file, no external requests).
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function build() {
  const tpl = fs.readFileSync(path.join(root, 'web', 'index.template.html'), 'utf8');
  const bundle = ['checklist.js', 'sender.js']
    .map((f) => fs.readFileSync(path.join(root, 'src', f), 'utf8'))
    .join('\n');
  if (/<\/script/i.test(bundle)) throw new Error('engine source contains </script');
  return tpl.replace('/*__ENGINE__*/', () => bundle);
}

if (require.main === module) {
  const out = path.join(root, 'docs', 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, build());
  process.stdout.write('wrote ' + path.relative(root, out) + '\n');
}

module.exports = { build };
