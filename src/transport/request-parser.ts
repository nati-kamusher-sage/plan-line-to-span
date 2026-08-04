/**
 * RequestParser: validates envelope structure against the project's own JSON
 * Schema (DEC-40), and nothing else.
 *
 * Domain meaning is trusted after this structural boundary.
 *
 * Accepts a raw string, not a pre-parsed object (DT-6's raw-string transport
 * entry). A JSON object with duplicate members — `{"span":{"location":"4",
 * "location":"20"}}` — parses in JavaScript by silently keeping the last
 * value, which would make AC-VAL-03 unobservable if this parser only ever
 * received an already-parsed object. Detecting the duplicate requires
 * scanning the raw text before `JSON.parse` collapses it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// The package's declared default export (`export default Ajv2020` in its
// .d.ts) does not type-check as constructable under this project's nodenext
// module resolution, even though it is constructable at runtime — a mismatch
// between the shipped types and the shipped CJS `module.exports = Ajv2020`.
// The named export resolves to the identical value and does type-check.
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';

const SCHEMA_PATH = fileURLToPath(new URL('../../docs/schemas/plan-line-to-span-v1.schema.json', import.meta.url));
const SCHEMA: object = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

// DEC-41: the schema declares Draft 2020-12. The default Ajv build validates
// against Draft-07 and would silently mis-validate a 2020-12 schema rather
// than failing to load; using the 2020 build turns a wrong dialect into a
// load-time failure instead of a wrong-but-successful validation.
const ajv = new Ajv2020({ allErrors: false, strict: false });
const validateRequest: ValidateFunction = ajv.compile({ $ref: '#/$defs/request', ...SCHEMA });

export type DimensionMap = Readonly<Record<string, string>>;

interface RequestEnvelope {
  readonly contractVersion: 'plan-line-to-span/v1';
  readonly requestId?: string;
}

export interface InitializeRequest extends RequestEnvelope {
  readonly operation: 'initialize';
  readonly payload: {
    readonly format: string;
    readonly dimensions: readonly {
      readonly id: string;
      readonly name: string;
      readonly values: readonly {
        readonly key: string;
        readonly name: string;
        readonly parentKey?: string;
      }[];
    }[];
  };
}

interface SpanPayload { readonly span: DimensionMap }
interface UpdateSpanPayload {
  readonly span: DimensionMap;
  readonly replacementSpan: DimensionMap;
}

export interface CreateSpanRequest extends RequestEnvelope {
  readonly operation: 'createSpan';
  readonly payload: SpanPayload;
}

export interface UpdateSpanRequest extends RequestEnvelope {
  readonly operation: 'updateSpan';
  readonly payload: UpdateSpanPayload;
}

export interface DeleteSpanRequest extends RequestEnvelope {
  readonly operation: 'deleteSpan';
  readonly payload: SpanPayload;
}

export interface QuerySpanRequest extends RequestEnvelope {
  readonly operation: 'querySpan';
  readonly payload: SpanPayload;
}

export interface QueryPlanLineRequest extends RequestEnvelope {
  readonly operation: 'queryPlanLine';
  readonly payload: { readonly dimensions: DimensionMap };
}

/**
 * A structurally valid request, narrowed by `operation` so that a caller
 * switching on `operation` -- or using `Extract<ParsedRequest, {operation:
 * '...'}>` for a single-operation handler signature -- gets the
 * corresponding payload shape without a second cast. Each operation has its
 * own interface with a single-literal `operation` field so `Extract`
 * resolves cleanly; grouping create/update or delete/query under one
 * interface with a union `operation` field (the first version of this type)
 * defeats `Extract`, since it matches structurally rather than by
 * discriminant. The schema already encodes the operation-to-payload
 * correspondence (IC's `allOf` conditionals); this type makes it visible to
 * the type checker.
 */
export type ParsedRequest =
  | InitializeRequest
  | CreateSpanRequest
  | UpdateSpanRequest
  | DeleteSpanRequest
  | QuerySpanRequest
  | QueryPlanLineRequest;

export type ParseRequestResult =
  | { readonly ok: true; readonly request: ParsedRequest }
  | { readonly ok: false; readonly message: string };

/**
 * Parses and structurally validates a raw request body.
 *
 * @param raw the request body, as received — a JSON string, not a
 *   pre-parsed object, so that duplicate object members are still visible
 *   (AC-VAL-03; see the class-level comment).
 * Returns `ok: false` when `raw` is not valid JSON, contains a duplicate
 * object member, or does not conform to the structural request schema.
 */
export function parseRequest(raw: string): ParseRequestResult {
  if (hasDuplicateObjectMembers(raw)) {
    return { ok: false, message: 'request body contains a duplicate object member' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'request body is not valid JSON' };
  }

  if (!validateRequest(parsed)) {
    return { ok: false, message: ajv.errorsText(validateRequest.errors, { dataVar: 'request' }) };
  }
  return { ok: true, request: parsed as ParsedRequest };
}

/**
 * `JSON.parse` silently keeps the last value of a duplicate object member,
 * which would make a duplicate member structurally invisible by the time the
 * schema sees it (IC 3.1 requires `MALFORMED_REQUEST` for this case,
 * AC-VAL-03). A reviver cannot detect this either, since it also only sees
 * the already-collapsed result.
 *
 * This scans the raw text for a `"key":` pattern repeated within what
 * `JSON.parse` will treat as the same object literal, tracked by brace depth
 * so a duplicate at one nesting level does not false-positive against an
 * identically named key at another. It is a structural check on the text,
 * not a JSON parser in its own right — `JSON.parse` still does the real
 * parsing. The structural boundary converts malformed JSON into its declared
 * result in `parseRequest`.
 */
function hasDuplicateObjectMembers(raw: string): boolean {
  const stack: Set<string>[] = [];
  let inString = false;
  let escaped = false;
  let expectingKey = false;
  let keyStart = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') {
        inString = false;
        if (expectingKey && keyStart >= 0) {
          const key = raw.slice(keyStart, i);
          const frame = stack[stack.length - 1];
          if (frame) {
            if (frame.has(key)) {
              return true;
            }
            frame.add(key);
          }
          expectingKey = false;
        }
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      if (expectingKey) keyStart = i + 1;
      continue;
    }
    if (ch === '{') { stack.push(new Set()); expectingKey = true; continue; }
    if (ch === '}') { stack.pop(); continue; }
    if (ch === ',') {
      // Setting this unconditionally on every comma, including one inside an
      // array, looks unsafe at first: could an array element string then be
      // wrongly recorded as a key? No. JSON grammar guarantees every object
      // value is introduced by a ':', and ':' always resets expectingKey to
      // false before any value -- including an array's contents -- is
      // scanned. A comma can only leave expectingKey meaningfully `true`
      // when the very next string literal is genuinely in key position,
      // which is exactly the case this needs to catch. Confirmed by
      // property-style adversarial cases in request-parser.test.ts.
      expectingKey = true;
      continue;
    }
    if (ch === ':') { expectingKey = false; continue; }
    // whitespace and all other structural characters are irrelevant here
  }

  return false;
}
