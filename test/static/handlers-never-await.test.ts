/**
 * DEC-64: `handlers-never-await` as a static check rather than a runtime
 * test, because a runtime test can only sample a call path while a static
 * check on the source is exhaustive.
 *
 * DEC-39 requires operation handlers to be synchronous end to end: an
 * `await` yields to the event loop, reopening the interleaving that DEC-38
 * relies on being impossible for serial processing to hold by construction.
 *
 * This scans the dispatch layer's own source files for the `async` keyword
 * outside of comments and string literals. `async` is the only way to
 * introduce `await` inside a function body (top-level `await` is not used
 * anywhere in this codebase and is unavailable inside a class method
 * regardless), so absence of `async` is sufficient to establish absence of
 * `await` in that scope.
 *
 * This is a source-text scan, not a full parser: it strips block and line
 * comments and string/template literals first, then checks what remains for
 * a whole-word `async`. That is precise enough for this codebase's style
 * (no `async` appears in any string data anywhere) and does not require
 * bringing in a parser dependency for one check, per DT-1's
 * minimal-dependency principle.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DISPATCH_DIR = fileURLToPath(new URL('../../src/dispatch', import.meta.url));

/**
 * Strips content that could cause a false positive or false negative: block
 * comments, line comments, string literals (single/double quoted), and
 * template literals. Deliberately simple -- it does not handle a `/` that is
 * a division operator followed by something resembling a comment opener,
 * which does not occur in this codebase's style (verified by inspection,
 * not by this function).
 */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.ts'))
    .map(e => join(dir, e.name));
}

test('no dispatch-layer source file uses async outside comments and strings', () => {
  const files = listTsFiles(DISPATCH_DIR);
  assert.ok(files.length > 0, 'expected to find dispatch source files to scan');

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const stripped = stripCommentsAndStrings(source);
    const hasAsync = /\basync\b/.test(stripped);
    assert.equal(hasAsync, false,
      `${file} contains 'async' outside comments/strings; DEC-39 requires handlers to stay synchronous`);
  }
});

test('the stripping helper does not itself hide a real async (self-check)', () => {
  const withRealAsync = 'export async function f() {}';
  const withOnlyCommentedAsync = '// this uses async in a comment\nfunction f() {}';
  const withOnlyStringAsync = 'const s = "async";';

  assert.equal(/\basync\b/.test(stripCommentsAndStrings(withRealAsync)), true,
    'a genuine async keyword must still be detected after stripping');
  assert.equal(/\basync\b/.test(stripCommentsAndStrings(withOnlyCommentedAsync)), false);
  assert.equal(/\basync\b/.test(stripCommentsAndStrings(withOnlyStringAsync)), false);
});
