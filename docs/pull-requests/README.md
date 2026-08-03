# Pull-Request Descriptions

One file per implementation task, named `<task-id>-<short-slug>.md`, committed with the code it describes.

Each file is passed to `gh pr create --body-file`, so the committed text *is* the pull-request body on GitHub. There is one authoritative description rather than two that can drift apart, and the record stays readable without a GitHub account or if the repository moves.

The template and the rules governing them are in the [Implementation Execution Plan](../implementation-plan.md) section 6.

The two rules that matter most:

- **Deviations from the design must be recorded.** An implementation that quietly differs from a design record breaks the traceability the process rests on.
- **Paste real output, not summaries.** "All tests pass" is not evidence; the suite output is.

| Task | Description | Pull request |
|---|---|---|
| T1 | [t1-index-core.md](t1-index-core.md) | [#2](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/2), merged |
| T2 | [t2-dimension-model.md](t2-dimension-model.md) | [#5](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/5), merged |
| T3 | [t3-span-store.md](t3-span-store.md) | [#6](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/6), merged |
| T4 | [t4-matching.md](t4-matching.md) | [#7](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/7), merged |
| T5 | [t5-global-zero-dim.md](t5-global-zero-dim.md) | [#8](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/8), merged |
| T6 | [t6-parser-envelope.md](t6-parser-envelope.md) | [#9](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/9), merged |
| T7 | [t7-dispatcher-lifecycle.md](t7-dispatcher-lifecycle.md) | [#10](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/10) |
| T8 | Skipped by explicit instruction | n/a |
| T9 | [t9-benefit-operations.md](t9-benefit-operations.md) | [#11](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/11) |
| T10 | [t10-observability.md](t10-observability.md) | [#12](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/12) |
| T11 | [t11-index-fault-injection.md](t11-index-fault-injection.md) | [#13](https://github.com/nati-kamusher-sage/plan-line-to-span/pull/13) |
