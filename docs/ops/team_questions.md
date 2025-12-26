# Team Questions

> Generated from master_logic_1.3.6_review | 2025-12-15

---

## Overview

Questions that arose during the MASTER_LOGIC v1.3.7 update that may need broader team input.

---

## Resolved Questions

These were answered during the review process.

### Q1: Should $100k ARR override tier classification?
**Decision**: No, employee count is the sole factor for tier classification.  
**Implemented**: Removed from `isEnterprise()` function in `tiers.ts`.

### Q2: Should overload threshold be fixed 130% or variance-based?
**Decision**: Variance-based (default 20%, configurable).  
**Implemented**: Changed to `DEFAULT_OVERLOAD_VARIANCE` in `constants.ts`.

### Q3: Should expansion opportunity pipeline count for customer accounts?
**Decision**: Yes, expansion opportunities on customer accounts count toward pipeline.  
**Implemented**: Added `calculatePipelineWithExpansion()` to `calculations.ts`.

### Q4: What to do with $100k/$500k thresholds?
**Decision**: Keep but mark as "legacy defaults".  
**Implemented**: Updated comments in `constants.ts` and documentation.

---

## Open Questions

These still need clarification or team discussion.

### Q5: Missing models.ts file?
**Context**: Review noted "aren't we missing a file for the models?"

**Answer**: No `models.ts` exists in `_domain/`. This is expected:
- TypeScript interfaces live in `types/` folder
- LP model parameters are in engine files
- No action needed unless there's a specific gap identified

### Q6: Renewal Specialist data migration
**Context**: RS concept deprecated in favor of Sales Tools bucket.

**Question**: Should we:
- A) Keep `is_renewal_specialist` field for backwards compatibility
- B) Migrate existing RS data to a new field
- C) Remove field entirely

**Recommendation**: Keep field but mark as deprecated in schema. No functional impact.

### Q7: Days with owner field usage
**Context**: Review noted "days_with_owner field will almost always be empty"

**Question**: Should we:
- A) Populate this field during import if data available
- B) Calculate it from owner change history
- C) Remove from scoring if unreliable

**Recommendation**: Document as optional field. Scoring should degrade gracefully when empty (already does).

---

## Process Notes

When questions arise during implementation:
1. Add to this document
2. Tag with priority (blocking vs nice-to-have)
3. Discuss in next sync
4. Document decision and implementation




