# Book Builder v1.4 - System Architecture

> Last Updated: 2025-12-22

This document provides a comprehensive visual map of the Book Builder application architecture, including page hierarchy, component relationships, service layers, and data flow.

---

## Table of Contents

1. [High-Level System Overview](#1-high-level-system-overview)
2. [Application Routing & Page Hierarchy](#2-application-routing--page-hierarchy)
3. [Build Detail - The Hub](#3-build-detail---the-hub)
4. [Component Architecture](#4-component-architecture)
5. [Service Layer Architecture](#5-service-layer-architecture)
6. [Domain Layer (SSOT)](#6-domain-layer-ssot)
7. [Data Flow](#7-data-flow)
8. [Assignment Engine Deep Dive](#8-assignment-engine-deep-dive)
9. [Key Component Dependencies](#9-key-component-dependencies)
10. [Potential Duplication Analysis](#10-potential-duplication-analysis)

---

## 1. High-Level System Overview

```mermaid
flowchart TB
    subgraph Frontend["Frontend (React/Vite)"]
        App[App.tsx]
        Pages[Pages]
        Components[Components]
        Hooks[Hooks]
    end
    
    subgraph DomainLayer["Domain Layer (SSOT)"]
        Domain["_domain/"]
        MasterLogic[MASTER_LOGIC.mdc]
    end
    
    subgraph ServiceLayer["Service Layer"]
        Services[Services]
        Optimization[Optimization Engine]
    end
    
    subgraph External["External"]
        Supabase[(Supabase DB)]
        EdgeFunctions[Edge Functions]
        HiGHS[HiGHS LP Solver]
    end
    
    App --> Pages
    Pages --> Components
    Components --> Hooks
    Hooks --> Services
    Components --> Domain
    Services --> Domain
    Hooks --> Domain
    Services --> Supabase
    Optimization --> HiGHS
    EdgeFunctions --> Supabase
```

---

## 2. Application Routing & Page Hierarchy

```mermaid
flowchart TD
    subgraph App["App.tsx (Root)"]
        Providers["Providers Stack"]
    end
    
    Providers --> QueryClient["QueryClientProvider"]
    QueryClient --> ThemeProvider
    ThemeProvider --> TooltipProvider
    TooltipProvider --> AuthProvider
    AuthProvider --> Router["BrowserRouter"]
    
    Router --> Routes
    
    subgraph Routes["Route Definitions"]
        Auth["/auth → Auth.tsx"]
        Dashboard["/ → Index.tsx → Dashboard.tsx"]
        BuildDetail["/build/:id → BuildDetail.tsx"]
        Review["/review → ReviewNotes.tsx"]
        Summary["/summary → SummaryImpact.tsx"]
        Governance["/governance → Governance.tsx"]
        Manager["/manager-dashboard → ManagerDashboard.tsx"]
        RevOps["/revops-final → RevOpsFinalView.tsx"]
        Settings["/settings → Settings.tsx"]
        NotFound["* → NotFound.tsx"]
    end
    
    Routes --> ProtectedRoute["ProtectedRoute wrapper"]
    ProtectedRoute --> Layout["Layout wrapper"]
    
    style BuildDetail fill:#f9f,stroke:#333,stroke-width:4px
```

### Page Roles

| Page | Purpose | Access |
|------|---------|--------|
| **Dashboard** | Build list management (create, edit, delete, duplicate) | All authenticated |
| **BuildDetail** | **Main workflow hub** - 6-tab wizard for book building | All authenticated |
| **ManagerDashboard** | FLM approval queue and team review | FLM role |
| **RevOpsFinalView** | Final export and approval workflow | RevOps role |
| **Settings** | User preferences, version info | All authenticated |
| **Governance** | Role and permission management | Admin only |

---

## 3. Build Detail - The Hub

The `BuildDetail.tsx` page is the **primary workflow hub**. Everything happens inside a Build context.

```mermaid
flowchart TD
    subgraph BuildDetail["BuildDetail.tsx (The Hub)"]
        Header["Build Header<br/>(name, status, dates)"]
        
        subgraph Tabs["6-Stage Wizard (Tabs)"]
            T1["1. Import<br/>DataImport.tsx"]
            T2["2. Overview<br/>Data cards + analytics"]
            T3["3. Assignments<br/>AssignmentEngine.tsx"]
            T4["4. Balancing<br/>TerritoryBalancingDashboard.tsx"]
            T5["5. Clashes<br/>GlobalClashDetector.tsx"]
            T6["6. Review<br/>ComprehensiveReview.tsx"]
        end
        
        Header --> Tabs
        T1 -->|"Unlock Stage 1<br/>(Accounts + Reps)"| T3
        T3 -->|"Unlock Stage 2<br/>(Assignments Applied)"| T4
        T3 --> T5
        T3 --> T6
    end
    
    subgraph DataTables["Data Drill-Down Tabs"]
        DT1["AccountsTable"]
        DT2["OpportunitiesTable"]
        DT3["SalesRepsTable"]
    end
    
    T2 -.-> DT1
    T2 -.-> DT2
    T2 -.-> DT3
    
    style T3 fill:#ff9,stroke:#333,stroke-width:3px
```

### Tab Unlock Logic

```mermaid
stateDiagram-v2
    [*] --> Import: Start
    Import --> Overview: Always unlocked
    
    state "Stage 1 Check" as S1
    Overview --> S1
    S1 --> Assignments: hasAccounts && hasSalesReps
    S1 --> Locked1: missing data
    
    state "Stage 2 Check" as S2
    Assignments --> S2: after apply
    S2 --> Balancing: hasAssignments || wasUnlocked
    S2 --> Clashes: hasAssignments || wasUnlocked
    S2 --> Review: hasAssignments || wasUnlocked
    S2 --> Locked2: no assignments yet
```

---

## 4. Component Architecture

### Component Categories

```mermaid
flowchart LR
    subgraph ui["ui/ (51 files)"]
        Shadcn["Shadcn primitives<br/>button, card, dialog,<br/>table, tabs, etc."]
    end
    
    subgraph analytics["analytics/ (9 files)"]
        Charts["Balance charts<br/>Team fit pies<br/>Variance indicators"]
    end
    
    subgraph balancing["balancing/ (10 files)"]
        Balance["Before/after comparisons<br/>Success metrics<br/>KPI rows"]
    end
    
    subgraph dataTables["data-tables/ (4 files)"]
        Tables["AccountsTable<br/>OpportunitiesTable<br/>SalesRepsTable<br/>SalesRepDetailDialog"]
    end
    
    subgraph optimization["optimization/ (6 files)"]
        Opt["LP Config components<br/>Model selector<br/>Constraint editors"]
    end
    
    subgraph root["Root components (90+ files)"]
        Core["Core workflow:<br/>FullAssignmentConfig<br/>VirtualizedAccountTable<br/>AssignmentPreviewDialog<br/>etc."]
    end
```

### Key Component Hierarchy (Assignment Flow)

```mermaid
flowchart TD
    AE["AssignmentEngine.tsx<br/>(Page Component)"]
    
    AE --> FAC["FullAssignmentConfig<br/>(Configuration wizard)"]
    AE --> VAT["VirtualizedAccountTable<br/>(Account list)"]
    AE --> APD["AssignmentPreviewDialog<br/>(Review proposals)"]
    AE --> AGD["AssignmentGenerationDialog<br/>(Progress)"]
    AE --> ASD["AssignmentSuccessDialog<br/>(Confirmation)"]
    AE --> HARD["HierarchyAwareReassignDialog<br/>(Manual reassign)"]
    AE --> RM["RepManagement<br/>(Sales rep tab)"]
    AE --> WLE["WaterfallLogicExplainer<br/>(How it works)"]
    
    subgraph Hooks
        UAE["useAssignmentEngine"]
        UAC["useAccountCalculations"]
        UMF["useMappedFields"]
    end
    
    AE --> UAE
    AE --> UAC
    AE --> UMF
```

---

## 5. Service Layer Architecture

```mermaid
flowchart TD
    subgraph Services["services/"]
        direction TB
        
        subgraph Core["Core Services"]
            AS["assignmentService.ts<br/>(Legacy rules engine)"]
            SAE["simplifiedAssignmentEngine.ts<br/>(Primary engine)"]
            BDS["buildDataService.ts<br/>(Data loading)"]
            BIS["batchImportService.ts<br/>(CSV import)"]
        end
        
        subgraph Optimization["optimization/"]
            POE["pureOptimizationEngine.ts<br/>(LP orchestrator)"]
            
            subgraph Preprocessing
                DL["dataLoader.ts"]
                PCA["parentChildAggregator.ts"]
                SPH["strategicPoolHandler.ts"]
            end
            
            subgraph Scoring
                CS["continuityScore.ts"]
                GS["geographyScore.ts"]
                TAS["teamAlignmentScore.ts"]
            end
            
            subgraph Constraints
                LPB["lpProblemBuilder.ts<br/>(Build LP model)"]
                SL["stabilityLocks.ts"]
            end
            
            subgraph Solver
                HW["highsWrapper.ts<br/>(HiGHS interface)"]
            end
            
            subgraph Postprocessing
                MC["metricsCalculator.ts"]
                RG["rationaleGenerator.ts"]
            end
            
            subgraph Telemetry
                OT["optimizationTelemetry.ts"]
            end
        end
        
        subgraph Support["Support Services"]
            BTC["balanceThresholdCalculator.ts"]
            SNS["slackNotificationService.ts"]
            ERS["errorReportingService.ts"]
            PAS["parentalAlignmentService.ts"]
        end
    end
    
    POE --> Preprocessing
    POE --> Scoring
    POE --> Constraints
    POE --> Solver
    POE --> Postprocessing
    POE --> Telemetry
    
    HW --> HiGHS["HiGHS WASM<br/>(LP Solver)"]
```

### Service Responsibilities

| Service | Responsibility |
|---------|---------------|
| `simplifiedAssignmentEngine.ts` | **Primary** - Waterfall priority rules + LP optimization |
| `assignmentService.ts` | **Legacy** - Original rule engine (still used for some flows) |
| `pureOptimizationEngine.ts` | Orchestrates HiGHS LP solver for optimal assignments |
| `buildDataService.ts` | Centralized data fetching with caching |
| `batchImportService.ts` | Streaming CSV import with validation |
| `balanceThresholdCalculator.ts` | Computes rep capacity thresholds |

---

## 6. Domain Layer (SSOT)

The `_domain/` folder is the **Single Source of Truth** for all business logic.

```mermaid
flowchart TD
    subgraph Domain["_domain/ (Source of Truth)"]
        ML["MASTER_LOGIC.mdc<br/>📚 Documentation"]
        
        subgraph Code["Implementation Files"]
            CALC["calculations.ts<br/>getAccountARR()<br/>getAccountATR()<br/>calculateBalanceMax()"]
            TIERS["tiers.ts<br/>classifyTeamTier()<br/>TIER_THRESHOLDS"]
            GEO["geography.ts<br/>REGION_HIERARCHY<br/>normalizeRegion()"]
            CONST["constants.ts<br/>All thresholds<br/>DEFAULT_* values"]
            NORM["normalization.ts<br/>Data cleanup<br/>Typo handling"]
        end
        
        INDEX["index.ts<br/>(Re-exports all)"]
    end
    
    ML -.->|"Documents"| Code
    Code --> INDEX
    INDEX -->|"import from '@/_domain'"| Consumers
    
    subgraph Consumers["Consumer Layers"]
        Components
        Services
        Hooks
        Utils
    end
    
    style ML fill:#ffd,stroke:#333
    style Domain fill:#e8f5e9
```

### SSOT Flow (Mandatory)

```mermaid
flowchart LR
    Step1["1️⃣ MASTER_LOGIC.mdc<br/>Document rule first"]
    Step2["2️⃣ _domain/*.ts<br/>Implement function"]
    Step3["3️⃣ Consumer files<br/>Import and use"]
    
    Step1 --> Step2 --> Step3
    
    style Step1 fill:#ffeb3b
    style Step2 fill:#4caf50,color:#fff
    style Step3 fill:#2196f3,color:#fff
```

---

## 7. Data Flow

### Import → Assignment → Review Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as BuildDetail
    participant Import as DataImport
    participant Engine as AssignmentEngine
    participant Service as simplifiedAssignmentEngine
    participant LP as pureOptimizationEngine
    participant DB as Supabase
    
    User->>UI: Navigate to build
    UI->>DB: Fetch build data
    DB-->>UI: Build + summary
    
    Note over UI: Tab 1 - Import
    User->>Import: Upload CSV
    Import->>DB: Batch insert (accounts, opps, reps)
    DB-->>Import: Success
    Import-->>UI: Unlock Assignments tab
    
    Note over UI: Tab 3 - Assignments
    User->>Engine: Click "Configure"
    Engine->>UI: Show FullAssignmentConfig
    User->>Engine: Save config + Generate
    
    Engine->>Service: handleGenerateAssignments()
    Service->>LP: runOptimization()
    LP->>LP: Build LP model
    LP->>LP: Solve with HiGHS
    LP-->>Service: Optimal assignments
    Service-->>Engine: Assignment proposals
    
    Engine->>UI: Show AssignmentPreviewDialog
    User->>Engine: Click "Apply"
    Engine->>DB: Save assignments
    DB-->>Engine: Success
    Engine-->>UI: Unlock Balancing/Clashes/Review
```

### React Query Data Flow

```mermaid
flowchart TD
    subgraph Queries["TanStack Query Keys"]
        Q1["['build', id]"]
        Q2["['build-data-summary', id]"]
        Q3["['build-parent-accounts-optimized', id]"]
        Q4["['build-sales-reps', id]"]
        Q5["['enhanced-balancing', id]"]
        Q6["['workload-balance', id]"]
    end
    
    subgraph Hooks["Custom Hooks"]
        H1["useBuildDataSummary"]
        H2["useAssignmentEngine"]
        H3["useEnhancedBalancing"]
        H4["useAccountCalculations"]
    end
    
    subgraph Services["Service Layer"]
        S1["buildDataService"]
        S2["simplifiedAssignmentEngine"]
    end
    
    Q1 --> H1
    Q2 --> H1
    Q3 --> H2
    Q4 --> H2
    Q5 --> H3
    
    H1 --> S1
    H2 --> S2
    
    S1 --> DB[(Supabase)]
    S2 --> DB
```

---

## 8. Assignment Engine Deep Dive

```mermaid
flowchart TD
    subgraph AE["AssignmentEngine.tsx"]
        Config["Configure Button"]
        Generate["Generate Button"]
        Tabs["Customer/Prospect/Reps tabs"]
    end
    
    Config --> Dialog1["FullAssignmentConfig Dialog"]
    
    subgraph FAC["FullAssignmentConfig Components"]
        BTC["Balance Threshold Config"]
        PRI["Priority Waterfall Config"]
        TMI["Territory Mapping Interface"]
        MOD["Optimization Model Selector"]
    end
    
    Dialog1 --> FAC
    FAC -->|"Save to DB"| AssignConfig["assignment_configuration table"]
    
    Generate --> Progress["AssignmentGenerationDialog"]
    Progress --> Hook["useAssignmentEngine.handleGenerateAssignments()"]
    
    subgraph Engine["Simplified Assignment Engine"]
        Load["Load accounts + reps"]
        Score["Calculate scores<br/>(geo, continuity, tier)"]
        Apply["Apply priority rules"]
        Balance["Run LP optimization"]
        Return["Return proposals"]
    end
    
    Hook --> Engine
    Engine -->|"Proposals"| Preview["AssignmentPreviewDialog"]
    Preview -->|"Apply"| Execute["handleExecuteAssignments()"]
    Execute -->|"Save to DB"| Assignments["assignments table"]
    Execute --> Success["AssignmentSuccessDialog"]
```

### Priority Waterfall (Simplified)

```mermaid
flowchart TD
    Start["Account to assign"]
    
    Start --> P1{"Locked?"}
    P1 -->|Yes| Keep["Keep current owner"]
    P1 -->|No| P2
    
    P2{"Current owner valid<br/>& capacity OK?"}
    P2 -->|Yes| Continuity["Continuity: Keep owner"]
    P2 -->|No| P3
    
    P3{"Geo match<br/>available?"}
    P3 -->|Yes| GeoMatch["Assign to geo-matched rep"]
    P3 -->|No| P4
    
    P4{"Tier match<br/>available?"}
    P4 -->|Yes| TierMatch["Assign to tier-matched rep"]
    P4 -->|No| P5
    
    P5["LP Optimization<br/>(balance workload)"]
    P5 --> Result["Final Assignment"]
    
    Continuity --> Result
    GeoMatch --> Result
    TierMatch --> Result
    Keep --> Result
```

---

## 9. Key Component Dependencies

### Which components use which hooks/services?

```mermaid
flowchart TD
    subgraph Pages
        BD["BuildDetail"]
        AE["AssignmentEngine"]
        TBD["TerritoryBalancingDashboard"]
        MD["ManagerDashboard"]
    end
    
    subgraph Hooks
        UAE["useAssignmentEngine"]
        UBD["useBuildData"]
        UEB["useEnhancedBalancing"]
        UMF["useMappedFields"]
    end
    
    subgraph Services
        SAE["simplifiedAssignmentEngine"]
        BDS["buildDataService"]
        POE["pureOptimizationEngine"]
    end
    
    BD --> UBD
    AE --> UAE
    AE --> UMF
    TBD --> UEB
    
    UAE --> SAE
    UAE --> BDS
    SAE --> POE
    UBD --> BDS
```

---

## 10. Potential Duplication Analysis

### Areas to Watch

| Area | Status | Notes |
|------|--------|-------|
| **ARR Calculation** | ⚠️ Some violations | Should ONLY use `getAccountARR()` from `@/_domain` |
| **Assignment Services** | 🔴 Multiple engines | `assignmentService.ts` vs `simplifiedAssignmentEngine.ts` - need to consolidate |
| **Balance Thresholds** | ✅ Centralized | Uses `calculateBalanceMax()` from `@/_domain` |
| **Geography Scoring** | ✅ Centralized | Single source in `_domain/geography.ts` |
| **Tier Classification** | ✅ Centralized | Single source in `_domain/tiers.ts` |

### Component Duplication Check

```mermaid
flowchart TD
    subgraph Dialogs["Assignment Dialogs (OK - different purposes)"]
        APD["AssignmentPreviewDialog<br/>Review before apply"]
        AGD["AssignmentGenerationDialog<br/>Progress tracking"]
        ASD["AssignmentSuccessDialog<br/>Confirmation"]
        HARD["HierarchyAwareReassignDialog<br/>Manual reassign"]
    end
    
    subgraph Tables["Account Tables (OK - different contexts)"]
        VAT["VirtualizedAccountTable<br/>In AssignmentEngine"]
        AT["AccountsTable<br/>In data-tables/"]
    end
    
    subgraph Configs["Config Components (OK - different scopes)"]
        FAC["FullAssignmentConfig<br/>All settings"]
        BTC["BalanceThresholdConfig<br/>Just thresholds"]
        SAC["SimplifiedAssignmentConfig<br/>Quick config - DEPRECATED?"]
    end
    
    style SAC fill:#ffcccc
```

### Recommended Cleanup

1. **`SimplifiedAssignmentConfig.tsx`** - Appears to be superseded by `FullAssignmentConfig.tsx`. Consider deprecating.

2. **`assignmentService.ts`** - Legacy engine with some SSOT violations. Consider:
   - Auditing which code paths still use it
   - Migrating remaining usage to `simplifiedAssignmentEngine.ts`
   - Eventually deprecating

3. **Inline ARR calculations** - Several files still use inline `calculated_arr || arr || 0` instead of `getAccountARR()`. Track these in the SSOT compliance plan.

---

## Quick Reference: File Locations

| Need | File |
|------|------|
| **Business rules** | `src/_domain/MASTER_LOGIC.mdc` |
| **App routing** | `src/App.tsx` |
| **Main workflow** | `src/pages/BuildDetail.tsx` |
| **Assignment logic** | `src/pages/AssignmentEngine.tsx` |
| **LP optimization** | `src/services/optimization/pureOptimizationEngine.ts` |
| **Primary engine** | `src/services/simplifiedAssignmentEngine.ts` |
| **Data loading** | `src/services/buildDataService.ts` |
| **Constants** | `src/_domain/constants.ts` |
| **Calculations** | `src/_domain/calculations.ts` |

---

## Summary

The Book Builder architecture follows a clear layered pattern:

1. **Pages** → Define routes and layout
2. **Components** → UI building blocks
3. **Hooks** → React state and data fetching
4. **Services** → Business logic orchestration
5. **Domain** → Single Source of Truth for calculations and constants

The critical flow is:
```
Dashboard → BuildDetail (hub) → 6-tab wizard → Assignment Engine → LP Optimization → Review
```

All business logic **must** flow through `_domain/` per the SSOT rules.

