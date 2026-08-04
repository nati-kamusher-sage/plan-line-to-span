
# Engineering Change Proposal (ECP) - Phase 2
## applicable documentation
1. Phase 1 implementation plan: `docs/implementation-plan.md`

## Engineering Change Proposal
Phase 1 was completed per ref 1.
After talking with the architect he raised the following points:
1. the r-tree and the utility plan line to span, need not store or know about formula at all.  only the span is needed to be store no beneift containing span and formula.
2. the application should assume optimistic approach, no exception handling no validation. this is to prefer performance over correctness.  the application should assume that the data is correct and valid, and if it is not, then the application will fail.  this is to avoid any overhead of validation or exception handling.

Our ecp plan will need to address the following:
1. which engineering spec documentaion will be updated to reflect the changes (operational concept, interface contract, design)
2. what changes will be made to the code to reflect the changes.
3. A dedicated separate implementation plan will be made to apply the changes to the documentation and code documenting the above changes.  The implementation plan will be a separate document and will be referenced in this ECP.

## Clarification (2026-08-04)
Point 1 is broader than the index alone. Formula, benefit, and employee are removed as concepts entirely — not relocated, not made optional, but absent from the code, the contract, and the specification. The R*-tree stores spans only. Terminology follows: *plan line* replaces *employee*, `querySpan` replaces `queryBenefit`, `queryPlanLine` replaces `queryEmployee`.

The utility therefore stops being a benefit-lookup service and becomes a span-matching service: it stores spans and answers which stored spans apply to a given plan line.

## Implementation plan
[ECP-1 Implementation Plan](ECP-1-implementation-plan.md) — addresses the three points above: the code changes (section 4), the documents to be updated (section 5), and the task sequence (section 6).

## E0 rulings (2026-08-04)

The three implementation-blocking questions are settled:

1. **`updateBenefit` becomes `updateSpan`.** The request identifies the existing span and
   supplies its replacement. The operation removes the existing span and creates the new
   span. Its payload is `{ span, replacementSpan }`, where `span` is the current identity
   and `replacementSpan` is the requested new identity.
2. **All remaining benefit names become span names.** `createBenefit`→`createSpan`,
   `deleteBenefit`→`deleteSpan`, and `benefitCount`→`spanCount`.
3. **State errors survive optimistic execution.** `DUPLICATE_SPAN` and `NOT_FOUND` are
   retained because they report stored state rather than validate input.

These rulings are authoritative for the implementation plan and the E0 specification
update.

E0 also resolves two consequences while applying those rulings: `INVALID_STATE` and the
structural `MALFORMED_REQUEST` boundary remain; the unreleased draft contract is revised
in place as `plan-line-to-span/v1`. The acceptance catalogue retains all 48 historical
case lineages as 39 active cases and 9 explicitly retired cases.
