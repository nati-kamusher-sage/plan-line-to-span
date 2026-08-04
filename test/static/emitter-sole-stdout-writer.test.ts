/**
 * DT-8 section 9's open item, DT-9's static check: the privacy guarantee
 * DEC-53's closed-field builder gives only covers the emitter path. Nothing
 * in that design prevents a developer from calling `console.log` or
 * `process.stdout.write` directly elsewhere in the process, bypassing the
 * builder entirely and writing arbitrary payload data straight to stdout.
 *
 * This scans every `src/` file outside the observability module for
 * `console.log`/`console.info` and `process.stdout.write`, with comments and
 * string literals stripped first (the same technique as
 * `handlers-never-await.test.ts`, DEC-64). A source-text scan is exhaustive
 * over this codebase's style in a way a runtime test sampling call paths
 * could not be.
 *
 * `console.warn`/`console.error`/`process.stderr.write` are deliberately not
 * banned here: Node routes all three to stderr, not stdout, so they cannot
 * produce the failure Obs 2/7 guard against -- a payload-bearing line
 * indistinguishable from a real JSON Lines operation-completion record in
 * the captured stdout stream. T13's server startup banner uses
 * `process.stderr.write` for exactly this reason (an operational message,
 * not an operation-completion record), and banning stderr here would only
 * push it to reinvent its own ad hoc "write to fd 2" mechanism.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));
const OBSERVABILITY_DIR = fileURLToPath(new URL('../../src/observability', import.meta.url));

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

function listTsFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listTsFilesRecursive(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

const STDOUT_WRITE_PATTERN = /console\.(log|info)\s*\(|process\.stdout\.write\s*\(/;

test('no source file outside src/observability writes to stdout directly', () => {
  const files = listTsFilesRecursive(SRC_DIR).filter(f => !f.startsWith(OBSERVABILITY_DIR));
  assert.ok(files.length > 0, 'expected to find non-observability source files to scan');

  for (const file of files) {
    const stripped = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    assert.equal(STDOUT_WRITE_PATTERN.test(stripped), false,
      `${file} writes to stdout directly; only ObservabilityEmitter's sink may (DEC-53's privacy guarantee covers only that path)`);
  }
});

test('ObservabilityEmitter itself is the one place that writes to stdout', () => {
  const files = listTsFilesRecursive(OBSERVABILITY_DIR);
  const writers = files.filter(f => STDOUT_WRITE_PATTERN.test(stripCommentsAndStrings(readFileSync(f, 'utf8'))));
  assert.deepEqual(writers.map(f => f.split('/').pop()), ['observability-emitter.ts']);
});

test('the stripping and pattern together still detect a genuine offender (self-check)', () => {
  const offender = 'export function f() { console.log("leak"); }';
  const commented = '// console.log("not a real call")\nexport function f() {}';
  const stringOnly = 'export const s = "process.stdout.write(x)";';

  assert.equal(STDOUT_WRITE_PATTERN.test(stripCommentsAndStrings(offender)), true);
  assert.equal(STDOUT_WRITE_PATTERN.test(stripCommentsAndStrings(commented)), false);
  assert.equal(STDOUT_WRITE_PATTERN.test(stripCommentsAndStrings(stringOnly)), false);
});
