/**
 * RequestParser: validates envelope structure against the project's own JSON
 * Schema (DEC-40), and nothing else.
 *
 * DEC-28 and DEC-42 require this component to never judge `formula` or
 * `format` — the schema deliberately leaves both structurally unconstrained
 * (see docs/schemas/plan-line-to-span-v1.schema.json's `$comment`s) so that
 * `INVALID_FORMULA` and `INVALID_DIMENSION_DEFINITION` reach their semantic
 * owners (`FormulaValidator`, `DimensionModelBuilder`) instead of being
 * pre-empted here as `MALFORMED_REQUEST`. This is what prevents the
 * regression the WP-7 readiness review recorded as ISSUE-03: fixing it
 * structurally, not by remembering an ordering convention.
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

interface BenefitPayload { readonly span: DimensionMap; readonly formula: unknown }
interface SpanPayload { readonly span: DimensionMap }

export interface CreateBenefitRequest extends RequestEnvelope {
  readonly operation: 'createBenefit';
  readonly payload: BenefitPayload;
}

export interface UpdateBenefitRequest extends RequestEnvelope {
  readonly operation: 'updateBenefit';
  readonly payload: BenefitPayload;
}

export interface DeleteBenefitRequest extends RequestEnvelope {
  readonly operation: 'deleteBenefit';
  readonly payload: SpanPayload;
}

export interface QueryBenefitRequest extends RequestEnvelope {
  readonly operation: 'queryBenefit';
  readonly payload: SpanPayload;
}

export interface QueryEmployeeRequest extends RequestEnvelope {
  readonly operation: 'queryEmployee';
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
  | CreateBenefitRequest
  | UpdateBenefitRequest
  | DeleteBenefitRequest
  | QueryBenefitRequest
  | QueryEmployeeRequest;

export class MalformedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedRequestError';
  }
}

/**
 * Parses and structurally validates a raw request body.
 *
 * @param raw the request body, as received — a JSON string, not a
 *   pre-parsed object, so that duplicate object members are still visible
 *   (AC-VAL-03; see the class-level comment).
 * @throws MalformedRequestError if `raw` is not valid JSON, contains a
 *   duplicate object member anywhere, or does not conform to the request
 *   schema. Never thrown for a null/non-object `formula` or an unsupported
 *   `format` value — those are `FormulaValidator`'s and
 *   `DimensionModelBuilder`'s responsibility (DEC-28, DEC-42).
 */
export function parseRequest(raw: string): ParsedRequest {
  let parsed: unknown;
  try {
    parsed = parseWithoutDuplicateMembers(raw);
  } catch {
    throw new MalformedRequestError('request body is not valid JSON, or contains a duplicate object member');
  }

  if (!validateRequest(parsed)) {
    throw new MalformedRequestError(ajv.errorsText(validateRequest.errors, { dataVar: 'request' }));
  }
  return parsed as ParsedRequest;
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
 * parsing, and still throws its own `SyntaxError` for malformed JSON, which
 * this function lets propagate.
 */
function parseWithoutDuplicateMembers(raw: string): unknown {
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
              throw new SyntaxError(`duplicate object member: ${key}`);
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

  return JSON.parse(raw);
}
