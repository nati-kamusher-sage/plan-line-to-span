# Implementation Execution Plan

| Document attribute | Value |
|---|---|
| Status | Approved 2026-07-31; execution in progress |
| Purpose | Sequence the implementation of the Plan Line to Span demo into single-session tasks |
| Governing input | The approved requirements baseline and the [Preliminary Design](design/dt-10-design-review.md) |
| Predecessor | [Preliminary Design Execution Plan](preliminary-design-plan.md), complete |
| Execution model | One AI-assistant task at a time, each on its own branch and GitHub pull request |
| Repository | https://github.com/nati-kamusher-sage/plan-line-to-span |
| Coverage check | [task-coverage-check.mjs](implementation/task-coverage-check.mjs) |

## 1. Approval gate

**Approved 2026-07-31.** The product owner and technical lead recorded approval in [DT-10](design/dt-10-design-review.md) section 8.1, accepting ISSUE-D1 as a phase boundary that does not block progression. Implementation may proceed.

ISSUE-D1 closes at T12, when the DT-7 harness first runs against the real index. Until then the OC 15.2 efficiency claim remains designed-for rather than demonstrated.

## 2. Objective

Produce a working demo that satisfies all 48 acceptance cases, with the OC 15.2 efficiency claim measured rather than merely designed for.

The phase is complete when:

1. All 48 acceptance cases pass against the built system.
2. ISSUE-D1 is closed: the DT-7 harness has run against the real index and met the pass condition.
3. Every open item the design assigned to implementation is resolved or explicitly re-deferred with an owner.
4. The regression suite runs green from a clean checkout and is the gate on every subsequent task.

## 3. Execution model

Work proceeds as a sequence of tasks, each performed by an AI assistant in a single session. No task depends on another running concurrently.

### 3.1 Per-task workflow

Work is hosted at https://github.com/nati-kamusher-sage/plan-line-to-span. Every task follows the same cycle:

1. **Sync.** `git checkout main && git pull origin main`, so the branch starts from what is actually on the remote rather than a stale local copy.
2. **Branch.** `git checkout -b <task-id>-<short-slug>`, for example `t4-matching`.
3. **Implement**, following the design records rather than re-deciding what they settle.
4. **Test.** Add the task's regression tests. The full suite must pass, not only the new tests.
5. **PR description.** Write `docs/pull-requests/<task-id>-<short-slug>.md` using the template in section 6.
6. **Commit** the code, tests, and PR description together.
7. **Push and open a pull request.** `git push -u origin <branch>`, then `gh pr create --base main --body-file docs/pull-requests/<task-id>-<short-slug>.md`. The committed description *is* the PR body, so the two cannot drift apart.
8. **Report** the outcome, including any design deviation, and wait for review. The assistant does not merge its own work unapproved.
9. **Merge** once approved, then `git checkout main && git pull origin main` before the next task begins.

### 3.1.1 Why the PR body is a committed file

The description is written to `docs/pull-requests/` and passed to `gh pr create --body-file`. This keeps one authoritative text rather than two, makes the record readable without a GitHub account, and means the rationale survives if the repository is ever moved or the host changes.

### 3.2 Constraints on the assistant

**The design is the specification.** Where a design record settles a question, implement it. Where implementation reveals the design is wrong, stop and report rather than silently diverging — a deviation discovered later is far more expensive than a paused task.

**One task at a time.** No task may begin before its predecessor is merged. Later tasks depend on earlier interfaces existing.

**Tests accumulate.** Each task's regression tests join the permanent suite. A task that breaks an earlier task's tests is not complete, whatever its own tests say.

**Report honestly.** If a task is partially done, say which parts. If a test is skipped, say so and why. A green report that hides a skipped case corrupts every later decision that relies on it.

**No TypeScript parameter-property constructor shorthand.** Found during T3: `constructor(public readonly x: T)` type-checks under `tsc --noEmit` but fails at runtime under Node's strip-only mode with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The type checker cannot catch this, because the code is valid TypeScript — the gap is in what the runtime stripper supports, not in types. Declare fields explicitly and assign them in the constructor body instead.

## 4. Task sequence

Tasks are ordered so risk is front-loaded, per DT-10's recommendation. The acceptance cases each task makes passable are listed; the allocation is verified to cover all 48 exactly once.

```
T1  index core               + 0  cumulative  0/48   [merged #2]
T2  dimension model          + 0  cumulative  0/48   [merged #5]
T3  span + store             + 0  cumulative  0/48   [merged #6]
T4  matching                 +11  cumulative 11/48   [merged #7]
T5  global + zero-dim        + 5  cumulative 16/48   [merged #8]
T6  parser + envelope        + 2  cumulative 18/48   [merged #9]
T7  dispatcher/lifecycle     + 9  cumulative 27/48   [merged #10]
T8  validation pipeline      + 5  cumulative 32/48   [skipped]
T9  benefit operations       +11  cumulative 38/48   (of 48; T8's 5 remain open)
T10 observability            + 4  cumulative 42/48   (of 48; T8's 5 remain open)
T11 index fault injection    + 1  cumulative 43/48   (of 48; T8's 5 remain open)
T12 performance harness      + 0  cumulative 43/48   (of 48; T8's 5 remain open)
T13 frontend                 + 0  cumulative 43/48   (of 48; T8's 5 remain open)
```

T1 through T3 deliver no acceptance cases. That is expected and is not a sign of poor sequencing: they build the index, the dimension model, and the store that every later case depends on. Their correctness is established by unit and property tests instead.

### T1 — n-dimensional R*-tree core

**Status: Complete.** Merged as [#2](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/2); see [t1-index-core.md](pull-requests/t1-index-core.md).

Implement the index, generalizing `rbush` under MIT with attribution (DEC-11, DEC-12).

- Coordinate arrays of arbitrary length, including zero (DT-3 section 5.1).
- Area and margin using empty-product and empty-sum conventions (DEC-18).
- Containment over zero axes returns true (DEC-16).
- Node splitting asserts a non-zero axis count (DEC-17).
- Consume `quickselect` unmodified.

**Resolves open items:** node capacity, split strategy parameters, reinsertion policy; attribution notice placement; test-runner selection.
**Tests:** unit tests for insert, remove, search, and split; the zero-axis invariant assertion; property test that search results equal a brute-force filter over the same boxes.
**Cases:** none directly.

**Outcome:** 30 tests pass. Written in TypeScript under `strict`, with `tsc --noEmit` gating the suite; Node 24 strips types natively, so there is no build step and no test framework. **DEC-12 was deviated from:** `quickselect` supports bulk loading, which this implementation does not have, so importing it would have satisfied the decision without using it. The project has no runtime dependencies.

### T2 — dimension model and interval labelling

**Status: Complete.** Merged as [#5](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/5); see [t2-dimension-model.md](pull-requests/t2-dimension-model.md).

Implement `DimensionModelBuilder` and `DimensionModel` (DEC-19 to DEC-22, DEC-25).

- Depth-first `[enter, leave]` labelling; forests sweep roots on a shared counter with no synthetic root.
- Validation: format, duplicate ids and keys, dangling parents, cycles.
- `spanToBox` and `planLineToPoint`.

**Tests:** promote `dt-2-differential.mjs` to a permanent property test — interval containment against a parent-walk oracle over generated models.
**Cases:** none directly.

**Outcome:** 54 tests pass, including the promoted differential test's 12,000 comparisons at the same seed as the design-phase prototype. **A real defect was caught by that test**: the first implementation of `planLineToPoint` marked an absent dimension with `emptyBox`'s identity, `[Infinity, -Infinity]`, which degenerates in the containment check and incorrectly satisfies a span that constrains the missing dimension. Fixed by using `[Infinity, Infinity]`, which fails against any finite span interval while still passing against the omitted-dimension wildcard. The unit tests written alongside the bug asserted the wrong marker shape and were rewritten to assert observable containment behavior instead.

### T3 — canonical span and benefit store

**Status: Complete.** Merged as [#6](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/6); see [t3-span-store.md](pull-requests/t3-span-store.md).

Implement `CanonicalSpan`, `SpanResolver`, and `BenefitStore` over `IndexAdapter` (DEC-24, DEC-31).

- Canonical key with member-order independence.
- Identity by canonical key, never by geometry.
- `IndexAdapter` expressed in spans and plan lines, not boxes and points.

**Tests:** unit tests for canonicalization, duplicate detection, and absence.
**Cases:** none directly.

**Outcome:** 78 tests pass, including an adversarial exact-lookup case: `RTree.search` returns every stored box that *contains* the query, so a child span's own box can surface a wider stored ancestor too. `IndexAdapter.findExact` uses geometry only to narrow candidates and decides identity by `CanonicalSpan.equals`, which is what DEC-24 requires and what keeps AC-BEN-05 correct. **A toolchain defect was found and fixed:** TypeScript's parameter-property constructor shorthand (`constructor(public readonly x: T)`) type-checks cleanly but fails at runtime under Node's strip-only mode with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. `tsc --noEmit` cannot catch this since the code is valid TypeScript — it is a runtime capability gap invisible to the type checker. Four sites were rewritten as explicit field declarations. **This is now a standing constraint on every later task:** do not use parameter-property shorthand anywhere in `src/` or `test/`.

### T4 — employee matching

**Status: Complete.** Merged as [#7](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/7); see [t4-matching.md](pull-requests/t4-matching.md).

Wire matching end to end so the `AC-MATCH-*` cases can run.

**Cases:** `AC-MATCH-01` to `AC-MATCH-11`, including the section 12 scenario.
**Tests:** promote `dt-2-verify.mjs`; add the DEC-13 differential test against a naive linear-scan matcher.

**Outcome:** 90 tests pass; all eleven `AC-MATCH-*` cases pass against the real domain stack rather than the design prototype's stand-in. Cumulative 11/48. The DEC-13 differential test's first run reported a mismatch that a thorough investigation — a controlled `RTree` stress test, a full tree dump, and a hand-verified oracle — traced not to `RTree` or `BenefitStore` but to the test's own bookkeeping: it indexed stored spans by array position while skipping duplicates, so the position drifted from the formula value the moment any duplicate was skipped. Fixed by keying stored spans by formula. Both the index and the store were correct throughout; only the test's accounting was wrong.

### T5 — global span and zero-dimensional model

**Status: Complete.** Merged as [#8](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/8); see [t5-global-zero-dim.md](pull-requests/t5-global-zero-dim.md).

The all-axis-covering box and the zero-axis model (DEC-14 to DEC-16).

**Cases:** `AC-GLOBAL-01` to `AC-GLOBAL-04`, `AC-ZERO-01`.
**Tests:** promote `dt-3-representation-probe.mjs`.

**Outcome:** 97 tests pass; all five named cases pass. No production code changed — DEC-14 and DEC-15 were already realized by construction once `spanToBox` existed in T2, and DEC-16 was already covered at the `RTree` level in T1. Also promoted two scenarios the prototype covered beyond the named cases: coexistence of the global benefit with an ordinary one, and confirmation that exact lookup for a non-empty span never returns the global benefit.

### T6 — request parser and envelope

**Status: Complete.** Merged as [#9](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/9); see [t6-parser-envelope.md](pull-requests/t6-parser-envelope.md).

`RequestParser` compiling the project's JSON Schema at runtime (DEC-40, DEC-41).

- Draft 2020-12 validator.
- Envelope structure only; never judges `formula` or `format` (DEC-28, DEC-42).
- Raw-string transport entry so duplicate members are detectable.

**Resolves open items:** validator selection.
**Cases:** `AC-VAL-03`, `AC-VAL-06`.
**Tests:** promote `schema-examples-validate` — the eight interface examples must keep validating.

**Outcome:** 122 tests pass; `ajv` moves to a runtime dependency (Draft 2020-12 build). **A toolchain issue was found and worked through:** `ajv`'s shipped `.d.ts` declares an ES-module default export while the shipped JS does a legacy `module.exports = Ajv2020` reassignment, so the two disagree and a plain default import fails `nodenext` type-checking despite working at runtime. Resolved by importing the named export instead, confirmed identical to the default at runtime. A parser-correctness question about the duplicate-member scanner's handling of arrays was checked with two adversarial constructions rather than assumed safe; both pass, and the reasoning is recorded in the code.

### T7 — dispatcher and lifecycle

**Status: Complete.** Merged as [#10](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/10); see [t7-dispatcher-lifecycle.md](pull-requests/t7-dispatcher-lifecycle.md).

`OperationDispatcher` and `LifecycleState` (DEC-29, DEC-30, DEC-34 to DEC-39).

- Intake gate as one expression from IC 6.1.
- Intake and completion distinct; only intake is gated.
- Candidate-then-swap reinitialization.
- Handlers synchronous end to end.

**Resolves open items:** `priorState` storage; non-200 status decision (ISSUE-D2).
**Cases:** `AC-INIT-01` to `AC-INIT-08`, `AC-SERIAL-01`.
**Tests:** promote `dt-5-lifecycle.mjs`; add the `handlers-never-await` static check (DEC-64).

**Outcome:** 150 tests pass. ISSUE-D2 resolved for the demo by not modelling an HTTP status at this layer at all — `error.code` remains the sole authority per DT-1 DEC-4. `AC-INIT-06` (an operation submitted while initializing) is satisfied by a narrow test-only accessor exposing `LifecycleState` directly, matching DT-9's anticipation that no new seam was needed, since DEC-39's synchronous handlers mean genuine concurrent interleaving cannot arise to test against. **Two defects surfaced and were fixed:** T6's `ParsedRequest` union grouped two operations under one interface with a union-valued discriminant, which defeated `Extract`-based type narrowing; split into one interface per operation. Separately, `if (a.op === 'x' || a.op === 'y') { a.payload }` does not narrow a discriminated union in TypeScript the way a single equality check does — confirmed with an isolated reproduction before accepting it as real behavior rather than a misconfiguration.

### T8 — validation pipeline

**Status: Skipped**, by explicit user instruction, in favor of proceeding directly to T9. `AC-VAL-01`, `AC-VAL-02`, `AC-VAL-04`, `AC-VAL-05`, and `AC-VAL-07` remain open; the cumulative counts for T9 onward are annotated accordingly rather than silently absorbed. No `FormulaValidator` exists yet, so `formula` is currently unvalidated end to end — `INVALID_FORMULA` is a declared response code (`response.ts`) with nothing that produces it.

`FormulaValidator` and the ordered pipeline (DEC-43, DEC-44).

**Cases:** `AC-VAL-01`, `AC-VAL-02`, `AC-VAL-04`, `AC-VAL-05`, `AC-VAL-07`.
**Tests:** promote `dt-6-validation-pipeline.mjs` — the eighteen checks become permanent.

### T9 — benefit operations

**Status: Complete.** Merged as [#11](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/11); see [t9-benefit-operations.md](pull-requests/t9-benefit-operations.md).

Create, update, delete, and exact query end to end.

**Cases:** `AC-BEN-01` to `AC-BEN-11`.
**Tests:** full lifecycle sequences; opaque-formula preservation with a sentinel.

**Outcome:** 161 tests pass. No production code changed — T3's `BenefitStore` and T7's `OperationDispatcher` already implemented every behavior these cases require; this task verified it end to end through the contract surface. All 11 cases passed on the first run. `AC-BEN-11`'s structural-preservation half is verified; its log-privacy half is deferred to T10, which does not exist yet. T8 was skipped by explicit instruction, so `formula` remains unvalidated (`INVALID_FORMULA` is declared but unreachable).

### T10 — observability

**Status: Complete.** Merged as [#12](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/12); see [t10-observability.md](pull-requests/t10-observability.md).

`ObservabilityEmitter`: decorator, closed-field builder, stdout sink (DEC-52 to DEC-59).

**Cases:** `AC-OBS-01` to `AC-OBS-04`.
**Tests:** promote `dt-8-log-builder.mjs`; add `capture-stdout` and the `emitter-sole-stdout-writer` static check.

**Outcome:** 187 tests pass. `OperationDispatcher` gained `dimensionCount`/`dimensionValueCount` getters alongside the existing `benefitCount`, so the emitter reads dispatcher state consistently rather than parsing `Response.data` for two of three counts. A test bug in `AC-OBS-04`'s first draft (a bare substring check for `"span"` that false-matched the event name `plan_line_to_span.operation_completed`) was caught by running the test and fixed to check for the field name instead. T8 remains skipped, so `INVALID_FORMULA` still has no exercised path anywhere, including through the emitter.

### T11 — index fault injection

The `inject-index-failure` seam at `IndexAdapter` (DEC-62, DEC-63).

**Cases:** `AC-INIT-09` — closing the gap the readiness review recorded as unverifiable.

### T12 — performance harness

Wire the comparison counter and run the DT-7 volumes (DEC-45 to DEC-51).

**Resolves:** **ISSUE-D1.** This is the task that closes the one design-phase item that could not be closed before code.
**Gate:** if the pass condition fails, the index is at fault, not the threshold. Investigate T1, do not relax DEC-48.

### T13 — frontend

A thin UI over the contract surface, added only after the backend passes all 48 cases (DEC-2).

**Resolves open items:** frontend framework selection.
**Cases:** none. The UI must add no behavior the contract does not define.

## 5. Regression testing

### 5.1 Principles

**The suite is the gate.** Every task runs the whole suite, not only its own tests. A task that breaks an earlier test is incomplete.

**Prototypes are promoted, not rewritten.** Nine of the fourteen design prototypes become permanent tests. They already encode the correct expectations and have caught real defects; rewriting them from memory would discard that.

**Property tests over example tests where an oracle exists.** The two differential tests found defects that hand-written cases missed. Where an independent oracle is available, use it.

### 5.2 Prototype promotion map

| Prototype | Becomes | Task |
|---|---|---|
| `dt-2-mapping.mjs`, `dt-2-verify.mjs` | Matching unit and case tests | T4 |
| `dt-2-differential.mjs` | Mapping property test | T2 |
| `dt-3-representation-probe.mjs` | Global-span case tests | T5 |
| `dt-4-error-ownership.mjs` | Error-ownership structural test | T8 |
| `dt-5-lifecycle.mjs` | Lifecycle table test | T7 |
| `dt-6-validation-pipeline.mjs` | Validation pipeline test | T8 |
| `dt-7-measurement-method.mjs` | Performance harness self-test | T12 |
| `dt-8-log-builder.mjs` | Privacy and record-shape test | T10 |
| `dt-9-case-mapping.mjs` | Coverage check against the catalogue | T4 onward |

`dt-2-pruning.mjs`, `dt-3-zero-dimensional-probe.mjs`, `dt-4-pipeline-order.mjs`, and `dt-10-design-review.mjs` remain design evidence and are not promoted; their content is covered by the promoted tests or by the design review itself.

### 5.3 Suite structure

| Layer | Content | Runs |
|---|---|---|
| Unit | Component internals | Every task |
| Contract | The 41 contract-layer acceptance cases | Every task |
| Harness | The 7 cases needing a test-only capability | Every task |
| Property | Differential tests over generated models | Every task |
| Static | `handlers-never-await`, `emitter-sole-stdout-writer` | Every task |
| Performance | DT-7 volumes and growth check | On demand, and in T12 |

Performance is excluded from the default run because it is slow and its purpose is evidence rather than regression detection (DT-7 section 7).

## 6. Pull-request descriptions

Every task produces `docs/pull-requests/<task-id>-<short-slug>.md`, committed with the code. These are a durable record of what changed and why, readable without access to a git host.

### 6.1 Template

```markdown
# <Task ID>: <Title>

| Attribute | Value |
|---|---|
| Task | <T-n> of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | <branch name> |
| Design records | <the DT documents implemented> |
| Decisions implemented | <DEC-n list> |
| Acceptance cases now passing | <AC ids, or "none; foundation task"> |

## What this changes

<Two or three sentences. What now exists that did not before.>

## Design decisions implemented

<Each DEC and how it is realized. Enough that a reviewer can check the
code against the decision without re-reading the design record.>

## Tests added

| Test | Kind | What it establishes |
|---|---|---|

## Full suite result

<Paste the suite output. Cumulative acceptance-case count.>

## Deviations from the design

<Any place the implementation differs from a design record, with
rationale. "None" if none — and that should be the usual answer.>

## Open items resolved

<Items this task closes, from the design records' open-item tables.>

## Follow-ups

<Anything discovered but deliberately not addressed, with the task or
owner that should pick it up.>
```

### 6.2 Rules

**Deviations are mandatory to record.** An implementation that quietly differs from a design record breaks the traceability the whole process rests on. If the design is wrong, say so in the PR and update the design record in the same task.

**Paste real output, not summaries.** "All tests pass" is not evidence; the suite output is.

**The cumulative case count appears in every PR**, so progress against the catalogue is visible without reconstructing it.

## 7. Definition of done, per task

A task is complete when all of the following hold:

1. Its acceptance cases pass, if it has any.
2. Its regression tests are added and pass.
3. The full suite passes from a clean checkout.
4. The PR description exists in `docs/pull-requests/` and records real output.
5. Deviations from the design are recorded, or there are none.
6. Open items the task was assigned are resolved or explicitly re-deferred.

## 8. Open items inherited from design

Each item the design assigned to implementation, with the task that resolves it.

| Item | Source | Task |
|---|---|---|
| Node capacity, split parameters, reinsertion policy | DT-2, DT-2a | T1 |
| Attribution notice placement | DT-2a | T1 |
| Runtime schema-validation library selection | DT-1, DT-6 | T6 |
| Whether an error envelope carries a non-200 status (ISSUE-D2) | DT-1, DT-4 | T7 |
| Where `priorState` is stored during initialization | DT-5 | T7 |
| Whether static checks run as lint rules or tests | DT-9 | T7, T10 |
| Test-runner selection | DT-9 | T1 |
| Wiring the comparison counter into `IndexAdapter` | DT-7 | T12 |
| First performance execution against the real index (ISSUE-D1) | DT-7, DT-10 | T12 |
| Frontend framework selection | DT-1 | T13 |

## 9. Risks

| ID | Risk | Mitigation |
|---|---|---|
| IR-1 | The R*-tree is hand-written, so index defects are the most likely source of wrong results. | T1 lands first with unit and property tests; T4 adds the DEC-13 differential test against a naive matcher; T12 measures pruning. |
| IR-2 | The design's retirements of RISK-1 to RISK-4 rest on prototypes using linear-filter stand-ins, not a real index. | T1 to T5 re-establish each with real code. A failure there invalidates a design retirement and must be reported, not worked around. |
| IR-3 | Single-session tasks may prove too large, producing partial work reported as complete. | Section 3.2 requires honest partial reporting. A task that cannot finish should be split and the plan updated. |
| IR-4 | Accumulated context loss across tasks may cause an assistant to re-decide a settled question. | The design records are the specification, and every PR lists the decisions it implements, making drift visible at review. |

## 10. Limitations

This plan sequences work; it does not schedule it. No effort estimates are given, deliberately — the execution model is one AI-assistant task at a time, and estimating that is guesswork with no basis in this repository.

The task boundaries are a judgment about what fits one session. Some will prove wrong. IR-3 covers the response: split the task and update the plan, rather than reporting partial work as complete.

The authorship-independence limitation recorded in the WP-7 readiness review and DT-10 section 9 extends to implementation. Every document, every design record, and every task in this plan originates in a single authorship chain. The regression suite is real evidence and the mechanical checks have caught genuine defects, but neither substitutes for a reviewer from outside that chain.
