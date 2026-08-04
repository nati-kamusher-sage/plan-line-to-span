/**
 * HttpTransportAdapter: the `TransportAdapter` component DT-4 section 3
 * describes (`handle(rawJson) -> responseEnvelope`, "holds no business
 * logic"), realized over Node's built-in `http` module rather than a
 * framework -- DT-1 R4 prefers the standard library and a small dependency
 * surface, and a single JSON POST endpoint plus static file serving does not
 * need routing middleware.
 *
 * IC 1 is transport-neutral: HTTP paths and status-code mappings are outside
 * the interface contract's scope. DT-1 section 3.4 only requires that the
 * transport stay thin and not let a status code replace or duplicate
 * `error.code`. Accordingly this adapter always returns HTTP 200 for a
 * request `dispatch` accepted or rejected within the contract (`ok: true` or
 * `ok: false` is carried entirely in the JSON body); a non-200 status here is
 * reserved for something outside the contract's vocabulary entirely -- a
 * missing endpoint, an unreadable body, a non-POST method -- which is
 * transport failure, not a `Response` the core ever produced.
 *
 * This class does not import or reference `SpanStore`, `DimensionModel`,
 * or any domain type. It reads bytes, calls one method, writes bytes.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import type { Response } from '../dispatch/response.ts';

/** The one method this adapter depends on -- satisfied by both `OperationDispatcher` and `ObservabilityEmitter`. */
export interface Dispatchable {
  dispatch(raw: string): Response;
}

const DISPATCH_PATH = '/api/dispatch';
const MAX_BODY_BYTES = 1_000_000;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export interface HttpTransportAdapterOptions {
  readonly dispatcher: Dispatchable;
  /** Directory of static frontend files to serve for any non-API GET request. */
  readonly staticDir: string;
}

export class HttpTransportAdapter {
  private readonly dispatcher: Dispatchable;
  private readonly staticDir: string;
  private readonly server: Server;

  constructor(options: HttpTransportAdapterOptions) {
    this.dispatcher = options.dispatcher;
    this.staticDir = options.staticDir;
    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'text/plain' });
        }
        res.end('internal error');
      });
    });
  }

  /** Returns the port actually bound -- useful with `port: 0` (OS-assigned), which tests use to avoid fixed-port collisions. */
  listen(port: number): Promise<number> {
    return new Promise(resolve => {
      this.server.listen(port, () => {
        const address = this.server.address();
        resolve(typeof address === 'object' && address !== null ? address.port : port);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close(err => (err ? reject(err) : resolve()));
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';

    if (req.method === 'POST' && url === DISPATCH_PATH) {
      return this.handleDispatch(req, res);
    }
    if (req.method === 'GET') {
      return this.handleStatic(url, res);
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }

  /**
   * Reads the raw request body and hands it to `dispatch` unparsed --
   * `RequestParser` owns JSON parsing and structural validation (DEC-28).
   * This method never inspects the body's content, only its byte length.
   */
  private async handleDispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const raw = await readBody(req, MAX_BODY_BYTES);
    if (raw === undefined) {
      res.writeHead(413, { 'content-type': 'text/plain' });
      res.end('request body too large');
      return;
    }

    const response = this.dispatcher.dispatch(raw);
    const body = JSON.stringify(response);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(body);
  }

  /** Serves a static frontend file. `/` maps to `index.html`. No directory listing, no traversal above `staticDir`. */
  private async handleStatic(url: string, res: ServerResponse): Promise<void> {
    const requestedPath = url === '/' ? '/index.html' : url;
    const normalized = normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(this.staticDir, normalized);

    if (!filePath.startsWith(this.staticDir)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden');
      return;
    }

    try {
      const contents = await readFile(filePath);
      const contentType = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
      res.writeHead(200, { 'content-type': contentType });
      res.end(contents);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  }
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
