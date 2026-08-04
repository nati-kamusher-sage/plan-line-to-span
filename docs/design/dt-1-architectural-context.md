# DT-1: Architectural Context and Technology Baseline

| Document attribute | Value |
|---|---|
| Status | ECP-1 amended architecture |
| Governing input | [Operational Concept](../operational-concept.md), [Interface Contract](../interface-contract.md), [Observability Contract](../observability-contract.md) |
| Decides | Runtime/language, topology, and governing design patterns |

## 1. Decision

Use Node with TypeScript in one backend process with in-memory state and a thin frontend.
Keep a hexagonal core with transport, index, and observability adapters. ECP-1 narrows the
domain to spans and plan lines and replaces the validation chain with optimistic
execution; the technology and topology decisions remain valid.

## 2. Runtime and language

| Requirement | Node and TypeScript fit |
|---|---|
| JSON request/response envelopes | Native JSON representation and serialization. |
| Span maps as direct stored payloads | Structural types model immutable dimension maps without wrappers. |
| Serial operations | Single event loop plus synchronous handlers prevents interleaving by construction. |
| JSON Lines stdout | Native `process.stdout.write`. |
| Monotonic duration | `performance.now()` supplies a monotonic clock. |
| Structural request boundary | Runtime schema compilation is required because TypeScript types erase. |
| N-dimensional index | Requires the direct implementation selected in DT-2a. |

### 2.1 Risks and mitigations

- **Type erasure:** compile the JSON Schema once at the raw request boundary. Do not
  duplicate semantic domain checks after parsing.
- **Index ecosystem:** keep the domain-facing adapter around the direct R*-tree.
- **Numeric precision:** interval coordinates are bounded by twice the value count and
  remain exact integers at demo scale.
- **Ecosystem churn:** prefer Node standard library and built-in test runner.

### 2.2 Alternatives

Plain JavaScript loses useful compile-time operation/result narrowing. JVM/.NET and native
languages add concurrency and integration cost outside the team stack. Their stronger
index ecosystems do not justify changing the selected demo runtime.

## 3. Deployment topology

The backend owns the model, store, R*-tree, contract dispatch, and structured stdout. The
frontend only constructs contract requests and displays responses.

A browser-only implementation cannot provide process stdout or the required capture
tests. A backend-only harness remains a valid intermediate stage, but the thin frontend
makes the demo visible without moving behavior out of the service.

The backend remains one process with no persistence, cache tier, recovery protocol, or
horizontal scaling. Restart clears state and resets the log sequence.

The transport stays thin. Contract response bodies remain authoritative; transport
status does not reinterpret a declared state outcome.

## 4. Patterns and principles

| Pattern | Placement and purpose |
|---|---|
| Hexagonal architecture | Domain core surrounded by transport, index, and observability adapters. |
| Adapter | Translate spans/plan lines to index geometry without leaking boxes into dispatch. |
| Strategy | Keep dimension-to-axis mapping isolated and testable. |
| Value object | Immutable canonical span supplies stored value and structural identity. |
| State table | Encode the four-state operation gate as data. |
| Command/discriminated request | Give dispatch one closed six-operation vocabulary. |
| Decorator | Time and record every declared operation outcome in one place. |
| Closed-field builder | Prevent domain maps from entering structured records. |

ECP-1 removes the semantic chain-of-responsibility pattern. After structural parsing, the
core trusts caller data.

Principles:

- Parse and narrow the structural envelope at the boundary.
- Keep canonical spans and the dimension model immutable.
- Point dependencies inward; adapters depend on core ports.
- Represent declared lifecycle/stored-state outcomes as result values.
- Let unexpected runtime exceptions propagate.
- Keep one writer for stored span state and one writer for stdout.
- Minimize dependencies and runtime checks.

## 5. Patterns deliberately excluded

Persistence repositories, event sourcing, CQRS, dependency-injection containers,
microservices, pub/sub logging, retries, and circuit breakers solve requirements outside
this single-process demo and would obscure the matching/index behavior.

## 6. Decisions recorded

| ID | ECP-1 status |
|---|---|
| DEC-1 | Retained: Node with TypeScript. |
| DEC-2 | Retained: backend and thin frontend, backend first. |
| DEC-3 | Retained: single process, in-memory state, no persistence. |
| DEC-4 | Retained: thin transport; contract body is authoritative. |
| DEC-5 | Retained: hexagonal core with index adapter. |
| DEC-6 | Retained only for structural schema parsing; semantic validation removed. |
| DEC-7 | Revised: result values cover four declared codes; other exceptions propagate. |
| DEC-8 | Retained: closed-field log construction. |

## 7. Exit criteria

The runtime, topology, boundary, and pattern catalogue remain settled. DT-4 defines the
reduced component graph, DT-6 defines optimistic execution, and E1/E2 prove the current
code conforms to those revisions.
