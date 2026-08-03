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
