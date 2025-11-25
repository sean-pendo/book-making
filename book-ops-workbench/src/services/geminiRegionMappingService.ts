/**
 * Gemini AI-Powered Region Mapping Service
 * 
 * Uses Supabase Edge Function to securely call Google's Gemini API
 * for intelligent territory-to-region mapping.
 * 
 * API key is stored securely on the server, not exposed to client.
 */

import { supabase } from '@/integrations/supabase/client';

// Special constant for territories that shouldn't be mapped to any region
export const NOT_APPLICABLE = '__NOT_APPLICABLE__';
export const NOT_APPLICABLE_LABEL = 'Not Applicable (Exclude from assignments)';

interface TerritoryMapping {
  territory: string;
  region: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

interface AIRegionMappingResult {
  mappings: Record<string, string>;
  details: TerritoryMapping[];
  unmappedCount: number;
  notApplicableCount: number;
}

/**
 * Map territories to regions using Gemini AI via secure edge function
 * 
 * @param territories - Array of territory names to map
 * @param availableRegions - Array of valid region names to map to
 * @returns Mapping result with territory-to-region mappings and details
 */
export async function mapTerritoriesWithGemini(
  territories: string[],
  availableRegions: string[]
): Promise<AIRegionMappingResult> {
  if (territories.length === 0) {
    return {
      mappings: {},
      details: [],
      unmappedCount: 0,
      notApplicableCount: 0
    };
  }

  if (availableRegions.length === 0) {
    throw new Error('At least one available region is required');
  }

  try {
    console.log(`[Gemini Mapping] Calling edge function for ${territories.length} territories`);
    
    const { data, error } = await supabase.functions.invoke('gemini-territory-mapping', {
      body: { territories, availableRegions }
    });

    if (error) {
      console.error('[Gemini Mapping] Edge function error:', error);
      throw new Error(error.message || 'Failed to call AI mapping service');
    }

    if (data.error) {
      console.error('[Gemini Mapping] API error:', data.error);
      throw new Error(data.error);
    }

    console.log(`[Gemini Mapping] Successfully mapped ${Object.keys(data.mappings).length} territories`);
    
    return {
      mappings: data.mappings,
      details: data.details,
      unmappedCount: data.unmappedCount,
      notApplicableCount: data.notApplicableCount
    };
  } catch (error) {
    console.error('[Gemini Mapping] Error:', error);
    throw new Error(`Failed to map territories with AI: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate if a mapping value is "Not Applicable"
 */
export function isNotApplicable(value: string): boolean {
  return value === NOT_APPLICABLE;
}

/**
 * Get the display label for a region value (handles NOT_APPLICABLE)
 */
export function getRegionDisplayLabel(value: string): string {
  if (value === NOT_APPLICABLE) {
    return NOT_APPLICABLE_LABEL;
  }
  return value;
}
