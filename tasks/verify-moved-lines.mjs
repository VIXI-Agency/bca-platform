#!/usr/bin/env node
// Proves that splitting admin/time/page.tsx was a pure move (tasks/plan.md).
//
// Every non-blank line of the original page.tsx (at BASE) must appear,
// unchanged, in the new set of files: page.tsx plus everything under _lib/
// and _components/ (tests excluded). Ignored on both sides: import
// statements, the 'use client' directive, leading/trailing whitespace and
// an `export ` / `export default ` prefix — the only things a move adds.
//
// Usage: node tasks/verify-moved-lines.mjs [baseRef]
// Exit code 0 = identical line multisets, 1 = differences (listed).

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? '74886f6';
const DIR = 'src/app/(dashboard)/admin/time';

function normalize(source) {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/^'use client';[ \t]*$/gm, '')
    .replace(/^import\b[\s\S]*?\bfrom\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .split('\n')
    .map((line) => line.trim().replace(/^export (default )?/, ''))
    .filter((line) => line.length > 0);
}

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function countLines(lines) {
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

const original = normalize(
  execSync(`git show "${BASE}:${DIR}/page.tsx"`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
);
const files = [join(DIR, 'page.tsx'), ...sourceFiles(join(DIR, '_lib')), ...sourceFiles(join(DIR, '_components'))];
const current = files.flatMap((file) => normalize(readFileSync(file, 'utf8')));

const before = countLines(original);
const after = countLines(current);
const missing = [];
const added = [];
for (const [line, n] of before) if ((after.get(line) ?? 0) < n) missing.push(`${n - (after.get(line) ?? 0)}× ${line}`);
for (const [line, n] of after) if ((before.get(line) ?? 0) < n) added.push(`${n - (before.get(line) ?? 0)}× ${line}`);

console.log(`Compared ${original.length} original lines (${BASE}) with ${current.length} lines in ${files.length} file(s).`);
if (missing.length === 0 && added.length === 0) {
  console.log('OK: identical — this was a pure move.');
  process.exit(0);
}
if (missing.length) console.log(`\nMissing from the new files (${missing.length}):\n  ${missing.join('\n  ')}`);
if (added.length) console.log(`\nNew in the new files (${added.length}):\n  ${added.join('\n  ')}`);
process.exit(1);
