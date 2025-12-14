-- Expand assignment_type constraint to support all use cases
-- This adds MANUAL_REASSIGNMENT for UI manual reassignments and SALES_TOOLS for unowned accounts

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_assignment_type_check;

ALTER TABLE assignments ADD CONSTRAINT assignments_assignment_type_check 
  CHECK (assignment_type IN (
    'AUTO_COMMERCIAL',      -- Automated engine assignments
    'MANUAL_ENTERPRISE',    -- Legacy enterprise manual
    'MANAGER_OVERRIDE',     -- Manager-level override
    'MANUAL_REASSIGNMENT',  -- UI manual reassignments (new)
    'SALES_TOOLS'           -- Accounts routed to Sales Tools bucket (new)
  ));





