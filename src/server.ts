/**
 * The demo's runnable entry point: wires OperationDispatcher,
 * ObservabilityEmitter, and HttpTransportAdapter together and starts
 * listening (`npm start`).
 *
 * This is the first point in the codebase where all three layers are
 * connected end to end outside of a test -- every prior task drove
 * OperationDispatcher or ObservabilityEmitter directly. No business logic
 * lives here: this file only constructs and connects, per DT-4's
 * TransportAdapter description ("holds no business logic").
 */

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { OperationDispatcher } from './dispatch/operation-dispatcher.ts';
import { ObservabilityEmitter } from './observability/observability-emitter.ts';
import { HttpTransportAdapter } from './transport/http-transport-adapter.ts';

const PORT = Number(process.env['PORT'] ?? 3000);
const STATIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'frontend');

const dispatcher = new ObservabilityEmitter(new OperationDispatcher());
const adapter = new HttpTransportAdapter({ dispatcher, staticDir: STATIC_DIR });

const boundPort = await adapter.listen(PORT);
// Deliberately stderr, not stdout: stdout is reserved for
// ObservabilityEmitter's JSON Lines records (Obs 2, Obs 7's privacy
// guarantee, and the emitter-sole-stdout-writer static check), and a
// startup banner is an operational message, not an operation-completion
// record.
process.stderr.write(`plan-line-to-span demo listening on http://localhost:${boundPort}\n`);
