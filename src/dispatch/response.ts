/**
 * Response and error envelope shapes, per Interface Contract sections 5-6.
 *
 * ISSUE-D2 (DT-1 DEC-4, recorded in the DT-10 design review) left whether an
 * error envelope is accompanied by a non-200 transport status to
 * implementation. Resolved here for the demo: no HTTP status is modelled at
 * this layer at all. OperationDispatcher returns a Response value directly,
 * and error.code remains the sole authority on outcome, per DEC-4. Whatever
 * transport eventually wraps this (T1's TransportAdapter) maps Response to
 * whatever status convention it likes without OperationDispatcher caring.
 */

import type { Operation } from './lifecycle-state.ts';

export const ERROR_CODES = [
  'MALFORMED_REQUEST', 'INVALID_DIMENSION_DEFINITION', 'UNKNOWN_DIMENSION',
  'UNKNOWN_DIMENSION_VALUE', 'DUPLICATE_SPAN', 'NOT_FOUND',
  'INVALID_STATE', 'INDEX_FAILURE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface SuccessResponse {
  readonly contractVersion: 'plan-line-to-span/v1';
  readonly operation: Operation;
  readonly ok: true;
  readonly requestId?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ErrorResponse {
  readonly contractVersion: 'plan-line-to-span/v1';
  readonly operation?: Operation;
  readonly ok: false;
  readonly requestId?: string;
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: { readonly state?: string };
  };
}

export type Response = SuccessResponse | ErrorResponse;

export function success(
  operation: Operation, data: Readonly<Record<string, unknown>>, requestId?: string,
): SuccessResponse {
  return requestId === undefined
    ? { contractVersion: 'plan-line-to-span/v1', operation, ok: true, data }
    : { contractVersion: 'plan-line-to-span/v1', operation, ok: true, data, requestId };
}

export function failure(
  code: ErrorCode, message: string,
  // Each field accepts an explicit `undefined` in addition to being
  // omittable: callers forward `request.requestId`, itself an optional
  // field typed `string | undefined`, and exactOptionalPropertyTypes
  // distinguishes "absent" from "present but undefined" strictly enough
  // that the narrower `operation?: Operation` form rejects that forwarding.
  options: { operation?: Operation | undefined; requestId?: string | undefined; state?: string | undefined } = {},
): ErrorResponse {
  const { operation, requestId, state } = options;
  return {
    contractVersion: 'plan-line-to-span/v1',
    ...(operation !== undefined ? { operation } : {}),
    ok: false,
    ...(requestId !== undefined ? { requestId } : {}),
    error: {
      code, message,
      ...(state !== undefined ? { details: { state } } : {}),
    },
  };
}
