/**
 * PriorityBadge Component
 * 
 * Centralized component for displaying assignment priority badges.
 * Matches on priority NAME keywords (not P# positions) to ensure
 * correct badges are shown regardless of mode-specific priority order.
 * 
 * Uses displayConfig from PRIORITY_REGISTRY as single source of truth.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Shield, Users, Globe, TrendingUp, AlertTriangle } from 'lucide-react';
import { PRIORITY_REGISTRY, type PriorityDefinition, type PriorityDisplayConfig } from '@/config/priorityRegistry';

// Map icon names to actual icon components
const ICON_MAP = {
  Shield,
  Users,
  Globe,
  TrendingUp,
  AlertTriangle,
} as const;

interface PriorityBadgeProps {
  /** The ruleApplied or rationale string from an assignment proposal */
  ruleApplied: string;
  /** Whether to show the text label (default: true) */
  showLabel?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Find a priority definition by matching keywords in the ruleApplied string.
 * 
 * Order matters: Check combined priorities (geo_and_continuity) BEFORE
 * standalone priorities (geography, continuity) to avoid false matches.
 */
function findPriorityByKeywords(ruleApplied: string): PriorityDefinition | null {
  if (!ruleApplied) return null;
  
  const lower = ruleApplied.toLowerCase();
  
  // Process priorities in a specific order to handle overlapping keywords
  // Combined priorities should be checked first
  const priorityOrder = [
    'geo_and_continuity',  // Must check before 'geography' or 'continuity'
    'sales_tools_bucket',
    'manual_holdover',
    'stability_accounts',
    'team_alignment',
    'geography',
    'continuity',
    'arr_balance',
  ];
  
  for (const priorityId of priorityOrder) {
    const priority = PRIORITY_REGISTRY.find(p => p.id === priorityId);
    if (!priority?.displayConfig?.matchKeywords) continue;
    
    // Check if any keyword matches
    const matches = priority.displayConfig.matchKeywords.some(kw => 
      lower.includes(kw.toLowerCase())
    );
    
    if (matches) {
      return priority;
    }
  }
  
  return null;
}

/**
 * Extract priority position prefix (P0, P1, P2, ... or RO) from ruleApplied string.
 * The position comes from the assignment engine based on actual priority configuration.
 */
function extractPositionPrefix(ruleApplied: string): string | null {
  const match = ruleApplied.match(/^(P\d+|RO):/);
  return match ? match[1] : null;
}

/**
 * PriorityBadge - Displays a styled badge for an assignment priority
 * 
 * Format: "P3: Geo+Cont" where:
 * - P3 comes from the actual priority configuration position
 * - Geo+Cont is the shortLabel from the priority registry displayConfig
 */
export function PriorityBadge({ 
  ruleApplied, 
  showLabel = true,
  className = ''
}: PriorityBadgeProps): React.ReactElement {
  // Extract priority position from the ruleApplied string (e.g., "P3" from "P3: Account Continuity")
  const positionPrefix = extractPositionPrefix(ruleApplied);
  
  // Try to find matching priority from registry by keywords
  const priority = findPriorityByKeywords(ruleApplied);
  
  // If found, render with registry display config + position prefix
  if (priority?.displayConfig) {
    const { icon, colorClass, shortLabel } = priority.displayConfig;
    const IconComponent = ICON_MAP[icon];
    
    // Build display text: "P3: Geo+Cont" or just "Geo+Cont" if no position
    const displayText = positionPrefix 
      ? `${positionPrefix}: ${shortLabel}`
      : shortLabel;
    
    return (
      <Badge variant="outline" className={`${colorClass} ${className}`}>
        <IconComponent className="w-3 h-3 mr-1" />
        {showLabel && displayText}
      </Badge>
    );
  }
  
  // Fallback: Extract P# prefix and show with neutral styling
  if (positionPrefix) {
    // Extract what comes after the prefix for display
    const afterPrefix = ruleApplied.substring(positionPrefix.length + 1).trim(); // +1 for the colon
    const displayText = afterPrefix.split(/[→\-:(]/)[0].trim() || positionPrefix;
    
    return (
      <Badge variant="outline" className={className}>
        {showLabel ? `${positionPrefix}: ${displayText}` : positionPrefix}
      </Badge>
    );
  }
  
  // Last resort: show raw text
  return (
    <Badge variant="outline" className={className}>
      {ruleApplied}
    </Badge>
  );
}

/**
 * Export helper for external use (e.g., charts that need display config)
 */
export function getPriorityDisplayConfig(priorityId: string): PriorityDisplayConfig | null {
  const priority = PRIORITY_REGISTRY.find(p => p.id === priorityId);
  return priority?.displayConfig ?? null;
}

export default PriorityBadge;

