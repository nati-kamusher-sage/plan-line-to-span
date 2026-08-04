/**
 * HttpTransportAdapter, driven over a real socket with a real `fetch` --
 * this is the first test in the suite that exercises an actual process
 * boundary rather than calling OperationDispatcher/ObservabilityEmitter
 * in-process. Confirms the adapter holds no business logic (DT-4 section 3):
 * it forwards raw bytes in, returns the Response envelope unmodified, and
 * makes no decision the core did not already make.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OperationDispatcher } from '../../src/dispatch/operation-dispatcher.ts';
import { HttpTransportAdapter } from '../../src/transport/http-transport-adapter.ts';
import { D1_FILE } from '../support/d1.ts';

const V = 'plan-line-to-span/v1';

async function withServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const staticDir = mkdtempSync(join(tmpdir(), 'plan-line-to-span-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>test fixture</title>');

  const dispatcher = new OperationDispatcher();
  const adapter = new HttpTransportAdapter({ dispatcher, staticDir });
  const port = await adapter.listen(0);

  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await adapter.close();
    rmSync(staticDir, { recursive: true, force: true });
  }
}

test('POST /api/dispatch forwards the raw body and returns the Response envelope unmodified', async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/api/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');

    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.data, { state: 'ready', dimensionCount: 2, benefitCount: 0 });
  });
});

test('a rejected request still returns HTTP 200, with ok:false and error.code carrying the outcome', async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/api/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    assert.equal(res.status, 200, 'DT-1 section 3.4: error.code is the sole authority, not the HTTP status');

    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'MALFORMED_REQUEST');
  });
});

test('a full create-then-query round trip works over the real HTTP transport', async () => {
  await withServer(async baseUrl => {
    const dispatch = async (request: unknown) => {
      const res = await fetch(`${baseUrl}/api/dispatch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      return res.json();
    };

    await dispatch({ contractVersion: V, operation: 'initialize', payload: D1_FILE });
    const createRes = await dispatch({
      contractVersion: V, operation: 'createBenefit',
      payload: { span: { location: '4' }, formula: { rate: 0.1 } },
    });
    assert.equal(createRes.ok, true);

    const queryRes = await dispatch({
      contractVersion: V, operation: 'queryBenefit', payload: { span: { location: '4' } },
    });
    assert.equal(queryRes.ok, true);
    assert.deepEqual(queryRes.data, { benefit: { span: { location: '4' }, formula: { rate: 0.1 } } });
  });
});

test('a GET request to / serves the static index.html', async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    const body = await res.text();
    assert.ok(body.includes('test fixture'));
  });
});

test('a GET request to an unknown static path returns 404', async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/does-not-exist.js`);
    assert.equal(res.status, 404);
  });
});

test('a directory-traversal attempt in a static path is rejected, not served', async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/../../../etc/passwd`);
    assert.notEqual(res.status, 200);
  });
});

test('an unsupported method on the dispatch path is not found', async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}${'/api/dispatch'}`, { method: 'GET' });
    assert.equal(res.status, 404);
  });
});
