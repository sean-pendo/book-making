---
name: Fix Custom Mode Switch
overview: Fix the bug where switching from ENT to Custom mode shows additional priorities (Sales Tools, Team Alignment) as enabled at the bottom instead of disabled with correct positioning.
todos:
  - id: fix-custom-mode-switch
    content: Update handleModeSelect to initialize new priorities as disabled with correct positions
    status: pending
  - id: add-import
    content: Add getAllPriorities to the priorityRegistry import
    status: pending
---

# Fix Custom Mode Priority Initialization

## Problem

When switching from ENT to Custom mode, priorities that weren't in ENT (like Sales Tools Bucket and Team Alignment) appear:
1. **Enabled by default** - should be OFF
2. **At the bottom** (position 999) - should respect their `defaultPosition` from COMMERCIAL mode

## Root Cause

In [`PriorityWaterfallConfig.tsx`](book-ops-workbench/src/components/PriorityWaterfallConfig.tsx), the `handleModeSelect` function (line 637) only resets config for non-CUSTOM modes:

```typescript
if (newMode !== 'CUSTOM') {
  const defaultConfig = getDefaultPriorityConfig(newMode);
  onConfigChange(defaultConfig);
}
// No handling for CUSTOM - preserves previous config as-is
```

When Custom mode shows ALL priorities via `getAvailablePriorities()`, priorities without config entries are treated as enabled (line 424: `config?.enabled !== false`).

## Solution

Modify `handleModeSelect` to handle CUSTOM mode by:
1. Keeping the current config for priorities that were already visible
2. Adding config entries for newly-visible priorities with `enabled: false` and correct `defaultPosition`

## Changes

### File: [`PriorityWaterfallConfig.tsx`](book-ops-workbench/src/components/PriorityWaterfallConfig.tsx)

Update `handleModeSelect` (around line 637):

```typescript
const handleModeSelect = useCallback((mode: string) => {
  const newMode = mode as AssignmentMode;
  onModeChange(newMode);

  if (newMode === 'CUSTOM') {
    // When switching to CUSTOM, add config entries for ALL priorities
    // - Keep existing config for priorities already in currentConfig
    // - Add new entries for priorities not in currentConfig as DISABLED
    const allPriorities = getAllPriorities();
    const newConfig = allPriorities.map(p => {
      const existing = currentConfig.find(c => c.id === p.id);
      if (existing) {
        return existing; // Keep existing config
      }
      // New priority - add as disabled with COMMERCIAL default position
      return {
        id: p.id,
        enabled: false,
        position: p.defaultPosition.COMMERCIAL ?? 999,
        subConditions: p.subConditions?.map(sc => ({
          id: sc.id,
          enabled: sc.defaultEnabled
        })),
        settings: p.id === 'team_alignment' ? { minTierMatchPct: 80 } : undefined
      };
    }).sort((a, b) => a.position - b.position);
    
    onConfigChange(newConfig);
  } else {
    const defaultConfig = getDefaultPriorityConfig(newMode);
    onConfigChange(defaultConfig);
  }
}, [currentConfig, onModeChange, onConfigChange]);
```

Also need to import `getAllPriorities` at the top of the file (add to existing import from `@/config/priorityRegistry`).
