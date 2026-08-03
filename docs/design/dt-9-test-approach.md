# DT-9: Test Approach

| Document attribute | Value |
|---|---|
| Status | Draft; awaiting technical-lead approval |
| Design task | DT-9 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md) |
| Governing input | [Acceptance Cases](../acceptance-cases.md); [Observability Contract](../observability-contract.md) 8 |
| Depends on | [DT-4](dt-4-component-structure.md), [DT-8](dt-8-observability.md) |
| Prototype | [case mapping](prototypes/dt-9-case-mapping.mjs) |

## 1. Decision

Three test layers. All 48 acceptance cases are executed, 41 through the public contract surface and 7 requiring a test-only capability. Six supplementary tests carry obligations that earlier design tasks handed forward, each traced to the decision that created it.

The mapping is **derived from the catalogue rather than transcribed**, so a case added later without a test fails the check rather than passing silently.

## 2. Test layers

| Layer | Definition | Cases |
|---|---|---:|
| Contract | Drives the public surface end to end: request in, response and log out. No internal access. | 41 |
| Harness | Requires a test-only hook or capability beyond the contract surface. | 7 |
| Property | Generated inputs compared against an independent oracle. | supplementary only |

Preferring the contract layer is deliberate. A test that drives the public surface verifies the assembled system rather than a component in isolation, and cannot pass because of a mock that mirrors the same misunderstanding as the code. The 41 contract-layer cases need no privileged access at all.

## 3. Test-only capabilities

The mapping identifies exactly four capabilities the harness must provide. Three of these were not visible before this analysis; the readiness review had flagged only `AC-INIT-09`.

| Capability | Cases | Why the contract surface is insufficient |
|---|---|---|
| `capture-stdout` | `AC-OBS-01` to `AC-OBS-04` | Log records are process output, not part of any response. Obs 8 explicitly requires capturing standard output. |
| `inject-index-failure` | `AC-INIT-09` | `INDEX_FAILURE` cannot be provoked by any valid request; the index must be made to fail. |
| `pause-during-initialize` | `AC-INIT-06` | The `initializing` state is transient. Observing rejection during it requires holding initialization open. |
| `raw-json-with-duplicate-members` | `AC-VAL-03` | Duplicate object members cannot be expressed in a JavaScript object literal; the test must send raw text. |

### 3.1 Design constraints on the capabilities

Each is a seam in production code, so each carries a risk of weakening what it tests.

`capture-stdout` is the least invasive: the emitter writes through an injectable sink defaulting to `process.stdout`. Tests substitute a collector. This does not alter the record, only its destination.

`inject-index-failure` is the one the readiness review worried about. The seam belongs in `IndexAdapter`, not `RTreeIndex`, so the fault is injected at the port rather than inside the algorithm. A test-only adapter that throws on a nominated operation satisfies `AC-INIT-09` without any production code aware of testing. **This closes the gap the readiness review recorded as unverifiable.**

`pause-during-initialize` requires `DimensionModelBuilder` to be substitutable so a test build can block. DT-4 already makes it a distinct component, so no new seam is needed.

`raw-json-with-duplicate-members` needs no production change — the transport must accept a raw string, which it already does.

## 4. Supplementary tests

Six tests exist beyond the catalogue. Each traces to a specific obligation rather than to a general wish for coverage.

| Test | Obligation |
|---|---|
| `differential-matching` | DT-2a DEC-13: the R*-tree against a naive linear-scan matcher over generated models. |
| `differential-mapping` | DT-2: interval containment against a parent-walk ancestor oracle. Already demonstrated at 12,000 comparisons. |
| `handlers-never-await` | DT-5 DEC-39: an await reopens the interleaving DEC-38 assumes impossible. |
| `emitter-sole-stdout-writer` | DT-8: the privacy guarantee covers the emitter path only, so a direct write elsewhere must fail the build. |
| `schema-examples-validate` | WP-7: the eight interface examples must continue to validate as the schema evolves. |
| `performance-growth` | DT-7 DEC-48, with the naive matcher as a control that must fail. |

The two differential tests are the highest-value items here. Hand-written cases confirm the situations the author imagined; generated inputs against an independent oracle explore shapes nobody chose. Both DT-2 defects that the prototypes caught were of that kind.

`handlers-never-await` and `emitter-sole-stdout-writer` are static checks rather than runtime tests — a lint rule or an AST assertion. Both concern properties that a runtime test can only sample, whereas a static check is exhaustive.

## 5. Fixtures

`D1` is defined in the acceptance catalogue and is the fixture for most cases. It must be constructed once and shared, not restated per test, so that a catalogue change propagates.

Generated fixtures for the differential and performance tests come from a **seeded deterministic generator**. DT-7's DEC-47 volumes and DEC-13's random models share it, so a failure in either is reproducible from its seed. A non-deterministic generator would make an intermittent failure nearly impossible to investigate.

## 6. Verification of the mapping

```
catalogue cases : 48
mapped cases    : 48
pass  every catalogue case is mapped, none invented

  contract   41
  harness     7

  pause-during-initialize            AC-INIT-06
  inject-index-failure               AC-INIT-09
  raw-json-with-duplicate-members    AC-VAL-03
  capture-stdout                     AC-OBS-01, AC-OBS-02, AC-OBS-03, AC-OBS-04
```

The check reads the catalogue and compares. It fails on an unmapped case and on a mapped identifier that does not exist, so the mapping cannot drift from the catalogue in either direction.

## 7. Decisions recorded

| ID | Decision | Rationale |
|---|---|---|
| DEC-60 | Three layers, with the contract layer preferred | Verifies the assembled system; cannot pass on a mock that shares the code's misunderstanding. |
| DEC-61 | The case-to-test mapping is derived from the catalogue, not transcribed | A case added without a test fails the check instead of passing silently. |
| DEC-62 | Four test-only capabilities, each a seam at a port rather than inside an algorithm | Fault injection at `IndexAdapter` leaves `RTreeIndex` unaware of testing. |
| DEC-63 | `AC-INIT-09` is executable via `inject-index-failure` | Closes the gap the readiness review recorded as unverifiable. |
| DEC-64 | `handlers-never-await` and `emitter-sole-stdout-writer` are static checks | Exhaustive where a runtime test can only sample. |
| DEC-65 | One seeded deterministic generator shared by differential and performance tests | Failures are reproducible from the seed. |

## 8. Open items

| Item | Owner |
|---|---|
| Test-runner selection | Implementation; DT-1's minimal-dependency principle favors the Node built-in runner |
| Whether static checks run as lint rules or a test | Implementation |

## 9. Limitations

This is a mapping and an architecture, not a test suite. It establishes that every case has an owner and that each needed capability is identified, which is what DT-9 was asked for. Whether the tests are correct once written is not something a mapping can establish.

The four capabilities are seams in production code. Each is small and sits at a port, but they exist because of testing, and that is a real if modest cost recorded rather than hidden.
