# Plan Line to Span

A demo utility that resolves employee plan lines to the benefit definitions that apply to them, using an n-dimensional R\*-tree for dimension-aware matching.

## The problem

In an xP&A budget grid, each employee is a plan line carrying dimension values such as location and department. Benefits are defined against *spans* — sets of dimension constraints — rather than against individual employees. A benefit for `{location: USA}` applies to everyone in the USA, including everyone in New York City, because the dimension hierarchy makes New York City a descendant of USA.

The utility answers two questions:

- **`Query Employee`** — given a plan line, which benefits apply? Uses subset matching with hierarchical ancestry.
- **`Query Benefit`** — given an exact span, which benefit is stored there? Exact equality; hierarchy does not broaden it.

A benefit may apply to many employees and an employee may receive many benefits. The relationship is derived at query time from the dimension model rather than maintained as links.

## How matching works

Each hierarchical dimension is labelled with nested `[enter, leave]` intervals from a depth-first traversal, so that a value's interval strictly contains every descendant's. Ancestor matching then becomes interval containment, which an R\*-tree evaluates natively — no hierarchy walk at query time.

```
location    4:[0,9]   20:[1,6]   22:[2,3]   30:[4,5]   21:[7,8]
            USA       New York   Manhattan  Brooklyn   Los Angeles
```

`4:[0,9]` contains everything, so USA is an ancestor of all. `20:[1,6]` contains Manhattan and Brooklyn but not Los Angeles `[7,8]`.

A span omitting a dimension covers that whole axis. The empty span therefore covers every axis at once, which is how the global benefit works without a special case.

## Status

Requirements elicitation and preliminary design are complete and approved. Implementation is in progress.

| Phase | State |
|---|---|
| Requirements baseline | Approved. 48 acceptance cases. |
| Preliminary design | Approved. 65 recorded decisions, 14 executable prototypes. |
| Implementation | In progress. 13 tasks; see the implementation plan. |

## Approach

The project is documentation-led. Behavior was settled and reviewed before code was written, and the design records are the specification that implementation follows.

Two habits carried through every phase and are worth naming, because they caught real defects:

**Mechanical checks over reading.** Claims are verified by execution where possible — schema validation, trace extraction, coverage checks. The readiness review found four contradictions that careful reading had missed.

**Independent oracles.** Where an obviously-correct reference implementation exists, the real one is compared against it over generated inputs. Hand-written cases confirm what the author imagined; differential tests explore what they did not.

## Repository layout

| Path | Contents |
|---|---|
| `docs/` | Requirements baseline, design records, plans, and PR descriptions |
| `docs/design/prototypes/` | Executable design evidence; run with `npm run prototypes` |
| `src/` | Implementation |
| `test/` | Unit, property, contract, and harness tests |

## Running

Requires Node 24 or later, which strips TypeScript natively — there is no build step.

```sh
npm install
npm test          # type-check, then the full suite
npm run prototypes # the design-phase evidence
```

The project has no runtime dependencies.

## Licence and attribution

The R\*-tree implementation is a derivative of [RBush](https://github.com/mourner/rbush) (MIT), generalized from two fixed axes to an arbitrary runtime axis count. See `NOTICE`.
