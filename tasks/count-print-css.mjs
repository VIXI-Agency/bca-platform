#!/usr/bin/env node
// Counts the print-related CSS the build emitted (tasks/plan.md, check #3):
// distinct `print:` utilities and the print helper classes. If Tailwind stops
// seeing a `print:` class after it moves to a new file, this number drops.
// Run after `pnpm build`.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function cssFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

const css = cssFiles('.next/static').map((file) => readFileSync(file, 'utf8')).join('\n');
const printUtilities = new Set(css.match(/\.print\\:[^{,\s]+/g) ?? []);

console.log(`print: utilities: ${printUtilities.size}`);
console.log(`@media print blocks: ${(css.match(/@media print/g) ?? []).length}`);
for (const helper of ['print-area', 'no-print', 'print-only']) {
  console.log(`.${helper} rules: ${(css.match(new RegExp(`\\.${helper}(?![\\w-])`, 'g')) ?? []).length}`);
}
