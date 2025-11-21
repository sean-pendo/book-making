# Prospect Accounts Data Architecture Issue

## Problem Statement

The current prospect accounts calculation has an underlying data architecture issue related to parent/child account relationships in opportunities.

## Current Data State

### Accounts Table
- **Total Accounts**: 189
  - **Parent Accounts (is_parent=true)**: 129
  - **Child Accounts (is_parent=false)**: 60
- **All accounts have ARR > 0** (all are customers)

### Opportunities Table
- **Total Opportunities**: 561
- **Unique sfdc_account_ids in opportunities NOT in accounts**: 146

### Dashboard Display Issue
- **Customer Accounts**: 129 ✅
- **Prospect Accounts**: 0 ❌ (Should be 146)

## Root Cause: Parent Account Hierarchy Missing in Opportunities

### Issue 1: Opportunities Reference Child Accounts
When opportunities reference `sfdc_account_id`:
- Some may reference **child accounts** (not parent accounts)
- Child accounts roll up to parent accounts via `ultimate_parent_id`
- Current logic counts all unique `sfdc_account_id` values (includes both parents AND children)

**Problem**: We're counting 146 "prospect accounts" but some of these might be child accounts, not unique parent prospects.

### Issue 2: Need Parent-Level Deduplication
To accurately count **unique prospect accounts**, we need to:

1. **Identify the parent account** for each opportunity
   - If `sfdc_account_id` exists in accounts table → use its `ultimate_parent_id` (or itself if parent)
   - If `sfdc_account_id` does NOT exist in accounts table → assume it's a parent-level prospect

2. **Deduplicate at parent level**
   - Multiple child opportunities should roll up to one parent prospect account
   - Multiple opportunities for same parent prospect should count as one prospect

## Data Architecture Questions

### Question 1: Ultimate Parent ID in Opportunities
Does the opportunities table have an `ultimate_parent_id` field?
- **If YES**: Use this to identify parent-level prospects
- **If NO**: Need to determine parent through account lookup or assume all are parent-level

### Question 2: Opportunity-to-Account Relationship
For the 146 `sfdc_account_ids` in opportunities but NOT in accounts:
- Are these ALL parent-level accounts (true prospects)?
- Or do some reference child accounts whose parents ARE in the accounts table?

## Proposed Solution Path

### Option A: If Opportunities Have ultimate_parent_id
```sql
-- Count unique PARENT prospects
SELECT COUNT(DISTINCT
  COALESCE(o.ultimate_parent_id, o.sfdc_account_id)
) as true_prospect_parents
FROM opportunities o
WHERE o.build_id = '{build_id}'
  AND COALESCE(o.ultimate_parent_id, o.sfdc_account_id) NOT IN (
    SELECT sfdc_account_id
    FROM accounts
    WHERE build_id = '{build_id}'
  );
```

### Option B: If Opportunities Only Have sfdc_account_id
Need to cross-reference with accounts table:
```sql
-- Check if opp sfdc_account_id is a child in accounts table
SELECT DISTINCT
  CASE
    -- If account exists and is a child, use its parent
    WHEN a.sfdc_account_id IS NOT NULL AND a.is_parent = false
      THEN a.ultimate_parent_id
    -- If account doesn't exist or is parent, use the ID itself
    ELSE o.sfdc_account_id
  END as parent_prospect_id
FROM opportunities o
LEFT JOIN accounts a
  ON o.sfdc_account_id = a.sfdc_account_id
  AND o.build_id = a.build_id
WHERE o.build_id = '{build_id}'
  AND (
    -- Either not in accounts table (true prospect)
    a.sfdc_account_id IS NULL
    OR
    -- Or is a child whose parent is not in accounts
    (a.is_parent = false AND a.ultimate_parent_id NOT IN (
      SELECT sfdc_account_id FROM accounts WHERE build_id = '{build_id}'
    ))
  );
```

## Next Steps

1. **Investigate opportunities table schema**
   - Check if `ultimate_parent_id` field exists
   - Understand parent/child relationship in opportunities

2. **Validate data relationships**
   - Of the 146 opportunity account IDs, how many are truly parent-level?
   - Do any reference child accounts whose parents exist in accounts table?

3. **Implement correct prospect calculation**
   - Use parent-level deduplication
   - Ensure prospects are counted at UFP (Ultimate Parent) level only

## Business Logic Definition

**Prospect Account** = A **parent-level account** (UFP) that:
- Has one or more opportunities in the opportunities table
- Does NOT have a corresponding account record in the accounts table (no ARR, not a customer yet)

**Must be deduplicated at parent level** to avoid counting child prospects multiple times.
