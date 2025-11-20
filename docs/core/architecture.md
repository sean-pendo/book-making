# Architecture & System Map

## 1. Data Flow Overview

The application follows a standard **Extract-Load-Transform (ELT)** pattern:

1.  **Extract/Import**: CSV files are uploaded by the user.
2.  **Load**: Data is parsed in the browser (PapaParse), validated, and then batched to Supabase.
3.  **Transform/Assign**: The Assignment Engine runs in the browser (or Edge Functions) to read the data, apply rules, and write `assignments` back to the DB.
4.  **Visualize**: React Query fetches the results for the UI.

## 2. Key Components

### A. Data Import Engine
*   **Entry Point**: `src/pages/DataImport.tsx`
*   **Logic**: `src/services/batchImportService.ts`
*   **Tables**: `accounts`, `opportunities`, `sales_reps`
*   **Key Behavior**:
    *   Uses `localStorage` to persist upload state across reloads.
    *   **Optimized Opportunity Import**: Deletes *all* existing opportunities for a Build ID before inserting new ones to avoid SQL timeouts.
    *   **Validation**: Runs client-side validation before sending to Supabase.

### B. Assignment Engine
The assignment logic is fragmented across multiple services (likely due to iterative development).

*   **Primary Engine**: `src/services/RebalancingAssignmentService.ts`
    *   Known as the "Complete Assignment Logic Overhaul".
    *   Handles the end-to-end flow: Fetch Data -> Apply Rules -> Optimize -> Save.
*   **Secondary/Legacy Engines**:
    *   `CollaborativeAssignmentService.ts`: Rule-based approach.
    *   `SophisticatedAssignmentService.ts`: Multi-pass approach (Geo -> Continuity -> Balance).
    *   `AlgorithmicAssignmentService.ts`: Older algorithmic approach.
*   **Critical Note**: When debugging "Generation" issues, first identify *which* service is actually being called by the UI.

### C. Database Schema (Supabase)
*   **Core Tables**:
    *   `accounts`: The territory data (Companies).
    *   `sales_reps`: The people assignments go to.
    *   `assignments`: The join table linking Accounts <-> Reps.
    *   `assignment_rules`: Configuration for the engine.
    *   `builds`: Metadata for a specific scenario (e.g., "FY26 Planning").

## 3. Critical Flows

### The "Generate Assignments" Flow
1.  User clicks "Generate" in `AssignmentGenerationDialog`.
2.  App calls `RebalancingAssignmentService.generateRebalancedAssignments()`.
3.  Service fetches ALL accounts and Reps for the current `build_id`.
4.  Service calculates "Dynamic Targets" (how many accounts per rep).
5.  Service executes rules (Geo, Vertical, etc.).
6.  Service writes results to `assignments` table.

## 4. Known Weak Points (QA Focus)
*   **State Sync**: `DataImport.tsx` relies heavily on local React state matching the DB state. If they drift (e.g., import fails but UI thinks it worked), the user sees "0 Accounts".
*   **Service Fragmentation**: The multiple assignment services create risk. A fix in one might not apply if the App is using the other.
