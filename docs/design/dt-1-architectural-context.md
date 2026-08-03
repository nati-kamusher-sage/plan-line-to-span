# DT-1: Architectural Context and Technology Baseline

| Document attribute | Value |
|---|---|
| Status | Draft; awaiting technical-lead approval |
| Design task | DT-1 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md) |
| Governing input | [Operational Concept](../operational-concept.md), [Interface Contract](../interface-contract.md), [Observability Contract](../observability-contract.md) |
| Decides | Runtime and language, deployment topology, and the design patterns governing the component structure |
| Blocks | DT-2, and through it every subsequent task |

## 1. Scope

This record answers three questions:

1. Is a Node and TypeScript web application a suitable technology baseline?
2. Should the demo split into a frontend and a backend, or run entirely in the browser?
3. Which design patterns and principles should govern the overall application design?

It does not design the index mapping, the component internals, or the validation pipeline. Those are DT-2, DT-4, and DT-6.

## 2. Runtime and language assessment

### 2.1 Recommendation

**Adopt Node with TypeScript.** The fit is good on the merits, not merely on team familiarity.

### 2.2 Assessment against the baseline

| Baseline requirement | Source | Node and TypeScript fit |
|---|---|---|
| JSON request and response envelopes | IC 2–5 | Native. JSON is the language's own data format; no serialization layer is needed between the contract and the runtime. |
| Formula is opaque, any JSON value, returned unchanged | OC 6.5, IC 3.2 | Strong. A structurally-typed language stores and returns an arbitrary JSON value without modelling it. In a nominally-typed language this needs a variant type or an escape hatch. |
| Serialized formula must not exceed 65,536 UTF-8 bytes | IC 3.2 | `Buffer.byteLength(JSON.stringify(formula), 'utf8')` measures exactly what the contract specifies. |
| Serial operation processing; no overlapping execution | OC 10, 16.1.14 | Strong, and unusually so. A single-threaded event loop with synchronous handlers makes serial processing the default rather than something enforced by a lock. See section 2.3. |
| Structured JSON Lines to the process console | Obs 2 | Native. `process.stdout.write(JSON.stringify(record) + '\n')` is the whole mechanism. |
| Duration in milliseconds, non-negative | Obs 3 | `performance.now()` gives sub-millisecond monotonic resolution, and is monotonic so a clock adjustment cannot produce a negative duration. |
| Tests capture stdout and parse each line | Obs 8 | Well supported by the standard test runners. |
| No additional top-level fields permitted | IC 2 | Requires explicit checking. TypeScript's compile-time types are erased at runtime and do **not** reject unknown fields; see section 2.4. |
| Index must not scan all benefits | OC 15.2 | Achievable, with a caveat on library maturity; see section 2.4. |

### 2.3 The strongest argument for Node

The serial-processing constraint (OC 16.1.14) is usually a burden: in a threaded runtime it means designing and testing a locking or queueing mechanism, and lock errors are among the hardest defects to reproduce.

Node inverts this. With a single-threaded event loop and synchronous operation handlers, no two operations can interleave — the constraint holds by construction. `AC-SERIAL-01` becomes a test that confirms an inherent property rather than one that probes a mechanism for races.

This aligns the runtime with the baseline unusually well, and it is a genuine engineering argument rather than a stack preference.

### 2.4 Risks and required mitigations

Four honest weaknesses. None is disqualifying; each needs a decision recorded in a later task.

**R1 — TypeScript types vanish at runtime.** The contract requires rejecting undeclared fields with `MALFORMED_REQUEST` (IC 2). A TypeScript interface does not do this; types are erased at compile time. Structural validation must be an explicit runtime mechanism. Mitigation: DT-6 designs runtime validation driven by the existing JSON Schema, which is already the structural contract and already validated in the readiness review. Do not hand-write validation that duplicates the schema.

**R2 — R\*-tree library maturity.** The JavaScript ecosystem's spatial indexes are predominantly 2-dimensional (`rbush` being the common choice). An n-dimensional R*-tree over an arbitrary dimension count is not a mature off-the-shelf component. Since the R*-tree is now a fixed objective, this is a real risk. Mitigation: DT-2 must decide between implementing the index directly and adapting a library, and must treat this as part of retiring RISK-1. Implementing an R*-tree is a known, bounded algorithm, and doing so makes the demonstration objective more visible rather than less — this is a defensible outcome, not a fallback.

**R3 — Numeric precision on axis coordinates.** JavaScript numbers are IEEE-754 doubles with exact integer behavior only to 2^53. Interval labelling of a hierarchy produces integer coordinates well below that bound for any demo-scale model, so this is not a practical limit — but DT-2 should state the assumption rather than leave it implicit.

**R4 — Ecosystem churn.** Node tooling moves quickly. Mitigation: prefer the Node standard library and its built-in test runner over a broad dependency tree. The demo's needs are narrow, and a small dependency surface also keeps the privacy prohibitions in Obs 7 easier to reason about.

### 2.5 Alternatives considered

| Option | Assessment |
|---|---|
| Node with TypeScript | **Recommended.** Best fit for JSON, opaque formulas, serial processing, and console logging. Team stack. |
| Node with plain JavaScript | Rejected. Discards compile-time modelling of nine error codes, four states, and the envelope shapes for no benefit, given the team already uses TypeScript. |
| A JVM or .NET language | Better n-dimensional index libraries and stronger numerics, but requires explicit concurrency control to satisfy serial processing, needs a variant type for opaque formulas, and is off the team's stack. Not justified. |
| Rust or C++ | Best index performance. Substantially higher cost for a demo with no performance target, and off-stack. Rejected. |

## 3. Deployment topology assessment

### 3.1 Recommendation

**Split into a backend and a frontend.** The algorithm runs in a Node backend; the UI is a thin frontend that drives it. This is not a close call — one baseline constraint effectively decides it.

### 3.2 The deciding constraint

The observability contract is not transport-neutral the way the interface contract is. It requires:

- JSON Lines written **to standard output** of the process (Obs 2).
- A `sequence` integer monotonically increasing **within the running process**, resetting on restart (Obs 3).
- Tests that **capture standard output** and parse each line (Obs 8).

A browser has no standard output. A frontend-only design cannot satisfy Obs 2 as written; it would have to reinterpret "process console" as the browser devtools console, and "capture standard output" as intercepting `console.log`. That is a change to a governing contract, not an implementation detail — and it would weaken `AC-OBS-01` through `AC-OBS-04`, the cases that verify the privacy prohibitions.

The privacy rules make this sharper. Obs 7 forbids spans, formulas, dimension values, and employee identifiers from ever reaching a log record. In a browser-only design the log lands in the user's devtools alongside the very payload data the contract excludes, so the prohibition loses most of its meaning.

### 3.3 Supporting arguments

**Separation matches the documented participants.** OC 5 lists the planning application and the utility as distinct participants, with the planning application supplying plan lines and consuming results. A process boundary makes that separation real instead of notional.

**It matches what the demo must show.** OC 3.2 excludes rendering the grid, and OC 11.6 assigns formula application to a downstream component. The interesting artifact is the matching engine. A backend keeps the demonstration objective — the R*-tree doing dimension-aware matching — visible and independently testable.

**It keeps the interface contract honest.** The contract defines JSON request and response envelopes exchanged with the utility. If the UI called the engine through direct function calls, the envelopes would become ceremony that a developer could bypass. A real boundary means every operation genuinely travels as a contract message, so conformance is exercised continuously rather than only in tests.

**The acceptance cases assume a callable interface.** All 48 cases are written as request-and-response sequences with observable log records. A backend exposing the contract satisfies them directly.

### 3.4 What the split must not become

Two cautions, since the baseline explicitly excludes them.

The backend must stay a **single process with in-memory state**. OC 3.2 excludes durable storage and recovery, and 16.1.15 excludes persistence. No database, no cache tier, no horizontal scaling. Restart means an empty index, and the observability contract already says `sequence` resets on restart.

The transport must stay **thin**. IC 1 is transport-neutral and IC 8 requires that a transport not reinterpret contract messages. HTTP status codes must not replace or duplicate the nine error codes: a rejected operation still returns `ok: false` with its `error.code` in the body. DT-4 should state whether a non-200 status accompanies an error envelope, and either answer is acceptable so long as `error.code` remains the authority.

### 3.5 Alternatives considered

| Option | Assessment |
|---|---|
| Backend plus thin frontend | **Recommended.** Satisfies Obs 2 and 8 natively; makes the contract boundary real. |
| Frontend only, in-browser | Rejected. Cannot satisfy the console-output and stdout-capture requirements without amending the observability contract, and weakens the privacy prohibitions. |
| Backend only, no UI, driven by a CLI or test harness | Viable and cheapest. Satisfies every acceptance case. Rejected as the primary plan only because a demo benefits from a visible artifact — but see the note below. |
| Isomorphic core shared between browser and server | Rejected for now. Adds packaging complexity to serve a portability goal nothing in the baseline requires. |

**Note on sequencing:** the backend-only option is a legitimate first increment. The engine, the contract surface, and all 48 acceptance cases can be complete and verified before any UI exists. Recommend building it in that order, so the frontend is additive and never on the critical path for demonstrating correctness.

## 4. Design patterns and principles

Patterns are proposed only where a baseline constraint motivates them. Each entry names the constraint it serves, so DT-4 can apply them without importing structure the demo does not need.

### 4.1 Patterns with a direct baseline justification

| Pattern | Applied to | Constraint it serves |
|---|---|---|
| **Hexagonal architecture (ports and adapters)** | The matching engine as the core; the transport, the index, and the log emitter as adapters. | IC 1 requires transport neutrality, and OC 1 disclaims prescribing transport. Keeps the engine independent of HTTP and of the index library, which directly serves R2 in section 2.4 — the index can be swapped without touching the engine. |
| **Adapter** | Around the R*-tree. | R2. The index choice is unresolved until DT-2. An adapter interface expressed in domain terms (spans, plan lines, matches) lets DT-2 change its mind without disturbing DT-4's component structure. |
| **Strategy** | The dimension-to-axis mapping. | RISK-1. DT-2 must compare mapping approaches; a strategy interface makes them substitutable and independently testable. |
| **Value object** with canonical form | The span. | OC 6.6 makes the span the benefit's identity, and IC 3.1 says member order does not affect identity. A canonical, immutable span with structural equality places identity in one place instead of scattering comparison logic. |
| **State pattern**, or an explicit transition table | The four-state lifecycle. | OC 8 and IC 6.1. IC 6.1 is already a state-by-operation acceptance table; expressing it as data rather than scattered conditionals makes it directly checkable against the contract, and the DT-5 exit criterion asks for exactly that. |
| **Chain of responsibility** | The validation pipeline. | IC 7 requires structural, then semantic, then state checks in an order where `MALFORMED_REQUEST` must not pre-empt `INVALID_FORMULA` or `INVALID_DIMENSION_DEFINITION`. An ordered pipeline makes precedence explicit and testable. |
| **Command** | Operation dispatch. | OC 10 and 16.1.14. Reifying each operation as a command supports serial queueing and gives the observability emitter one place to time and record every operation. |
| **Decorator** | Observability around operation handling. | Obs 2 requires one record per completed operation, emitted after the outcome is observable, and Obs 2 also requires that log failure not affect the response. A decorator keeps instrumentation out of the handlers and gives one enforcement point. |
| **Builder with a fixed field set** | Log record construction. | Obs 7's privacy prohibition. If records can only be constructed through a builder that accepts a closed set of primitive fields, a span or formula cannot reach a record by accident. This is what makes DT-8's exit criterion — that `AC-OBS-04` cannot fail by accident — structurally true rather than a matter of discipline. |

### 4.2 Principles

**Make illegal states unrepresentable.** The strongest available use of TypeScript, and the mitigation for R1's type erasure. A parsed request should become a type that cannot hold an unknown field; a span should be constructible only in canonical form. Parse at the boundary, then trust the type inward.

**Immutability of domain values.** Spans, the dimension model, and formulas are never mutated after construction. This makes the atomicity requirements (OC 8.3, 14.3) tractable: candidate-then-swap reinitialization becomes a reference swap, and a failed mutation cannot have partially modified anything.

**Dependency inversion toward the domain.** The engine depends on abstractions; the index, transport, and logger depend on the engine's interfaces. Serves IC 1 and R2.

**Total functions over exceptions for expected failures.** All nine error codes describe *expected* outcomes, not exceptional ones. A result type carrying either success data or an error code keeps every code path visible to the compiler and prevents an unhandled rejection from producing an undefined response. Reserve exceptions for genuine defects.

**Single writer for the index.** Only the engine mutates the index, and only through the dispatcher. Serves OC 14.3's requirement that a failed mutation leave no partial change.

**Minimal dependency surface.** Stated in R4. Also serves the privacy prohibitions: fewer third-party components means fewer places a payload value could be logged.

### 4.3 Patterns deliberately not adopted

Recording these matters as much as the adopted list, because a demo attracts unnecessary architecture.

| Pattern | Why not |
|---|---|
| Repository with a persistence abstraction | OC 3.2 and 16.1.15 exclude persistence. A repository interface over an in-memory index abstracts nothing. |
| Event sourcing or CQRS | Tempting because the contract uses event-style names (Add, Change, Get). But OC 3.2 excludes durable storage and idempotency, and there is no read-model or replay requirement. The naming is historical, not architectural. |
| Dependency-injection container | Fewer than a dozen components with a fixed graph. Manual composition in one place is clearer. |
| Microservices | One process, in-memory state, serial processing. |
| Observer or pub-sub for logging | Obs 2 requires exactly one record per operation, ordered. A decorator gives that directly; a bus adds indirection and an ordering question. |
| Retry or circuit breaker | No external dependency, no idempotency guarantee (OC 3.2). Retrying a mutation could violate duplicate-span semantics. |

## 5. Decisions recorded

| ID | Decision | Rationale |
|---|---|---|
| DEC-1 | Node with TypeScript | Section 2. Native JSON, opaque formulas, serial-by-construction, console logging. |
| DEC-2 | Backend and thin frontend, backend first | Section 3. The observability contract requires process stdout, which a browser cannot provide. |
| DEC-3 | Single process, in-memory state, no persistence | OC 3.2, 16.1.15. |
| DEC-4 | Thin transport; `error.code` remains authoritative over any status code | IC 1, IC 8. |
| DEC-5 | Hexagonal core with an index adapter | IC 1 transport neutrality and R2 index uncertainty. |
| DEC-6 | Runtime structural validation driven by the existing JSON Schema | R1. Avoids duplicating the structural contract. |
| DEC-7 | Result types rather than exceptions for the nine error codes | The codes are expected outcomes. |
| DEC-8 | Closed-field builder for log records | Obs 7, enforced structurally. |

## 6. Open items for later tasks

| Item | Owner task |
|---|---|
| Implement the n-dimensional index directly, or adapt a library | DT-2, as part of retiring RISK-1 |
| State the integer-coordinate range assumption for axis labelling | DT-2 |
| Whether an error envelope is accompanied by a non-200 status | DT-4 |
| Runtime schema-validation library selection | DT-6 |
| Frontend framework selection | Deferred until the backend and its acceptance cases are complete |

## 7. Exit criteria

The DT-1 exit criteria from the design plan are met: the runtime and language are chosen with rationale, the process and deployment model is defined, the utility-to-caller boundary is stated, and the library-or-service question is answered — the utility is a service exposing the contract, with the engine as an internally reusable module.

One item exceeds the plan's stated DT-1 scope and is recorded deliberately: the pattern and principle catalogue in section 4, which the product owner requested as part of this task. It constrains DT-4 rather than pre-empting it, since each entry names the baseline constraint it serves.
