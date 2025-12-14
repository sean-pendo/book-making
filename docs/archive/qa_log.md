# QA Log

This log tracks issues, bugs, and questions identified during the QA process.

## Round 1: Initial Functionality Check (2025-11-19)

**Goal**: Verify core functionality (Import, Assignment, Balancing) using "Cass's Data". Not focused on UI/UX polish yet.

### 🔴 Major Issues (Blockers)

1.  **Generation Flow Broken**:
    *   Generating assignments after setup is not functional.
    *   User is stuck and cannot proceed with the app's primary use case.
    *   *Status*: Open
    *   *Impact*: Critical

2.  **Data Import Instability**:
    *   Errors persist even after re-uploading data.
    *   "Process may be unrecoverable."
    *   Users see 0 accounts after upload until a hard refresh.
    *   Auto-mapping issues: `opp owner id` mapping to `owner_name` incorrectly.
    *   *Status*: Open
    *   *Impact*: Critical

3.  **Blank Assignments**:
    *   Assignments appear blank even if previous assignments existed.
    *   *Status*: Open
    *   *Impact*: Critical

### 🟠 Medium Issues & Questions

4.  **404 on Dashboard**:
    *   A specific dashboard link/route is returning a 404 error.
    *   *Status*: Open

5.  **Zero Values in Assignments Tab**:
    *   Metrics showing "0" - unclear if error or waiting for "Go".
    *   *Status*: Open

6.  **Region Mapping Confusion**:
    *   "Central for Pendo" vs "Region". What happens on mismatch?
    *   "Configuration loading" spinner persists even when data seems ready.
    *   *Status*: Open

7.  **Terminology**:
    *   Does "Parent" mean "UFP" (Ultimate Family Parent)?
    *   *Status*: Open

### 🟡 Minor Issues / UI

8.  **User Naming**:
    *   Users cannot change their name in settings, creating a disconnect from onboarding.
    *   *Status*: Open

9.  **Warnings**:
    *   Request to remove specific warning messages (need to identify which ones).
    *   *Status*: Open

### 🧠 Questions to Answer

*   **PE Play Logic**: How does this work?
*   **Rep List Source**: No Salesforce export? Need SOP for data headers.
*   **Data Recovery**: What does this feature actually do? (Talk to Nina).
*   **Deployment**: Prod environment considerations (Lovable vs Custom).

---
