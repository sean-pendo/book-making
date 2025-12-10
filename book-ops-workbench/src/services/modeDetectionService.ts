/**
 * Mode Detection Service
 * 
 * Auto-detects the appropriate assignment mode (ENT, COMMERCIAL, EMEA)
 * based on build region and data characteristics.
 */

import { supabase } from '@/integrations/supabase/client';
import { AssignmentMode } from '@/config/priorityRegistry';

export interface ModeDetectionResult {
  suggestedMode: Exclude<AssignmentMode, 'CUSTOM'>;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

interface BuildInfo {
  region: string;
}

interface DataCharacteristics {
  hasRenewalSpecialists: boolean;
  hasPEAccounts: boolean;
  hasSubRegions: boolean;
  renewalSpecialistCount: number;
  peAccountCount: number;
  subRegionCount: number;
}

/**
 * Detect the appropriate assignment mode for a build
 */
export async function detectAssignmentMode(buildId: string): Promise<ModeDetectionResult> {
  try {
    // Fetch build info and data characteristics in parallel
    const [buildInfo, dataChars] = await Promise.all([
      getBuildInfo(buildId),
      getDataCharacteristics(buildId)
    ]);

    const reasons: string[] = [];
    let suggestedMode: Exclude<AssignmentMode, 'CUSTOM'> = 'ENT';
    let confidence: 'high' | 'medium' | 'low' = 'medium';

    // EMEA: Primary signal is build region
    if (buildInfo.region === 'EMEA') {
      suggestedMode = 'EMEA';
      reasons.push('Build region is EMEA');
      
      if (dataChars.hasSubRegions) {
        confidence = 'high';
        reasons.push(`${dataChars.subRegionCount} reps have sub-regions assigned`);
      } else {
        confidence = 'medium';
        reasons.push('No sub-regions mapped yet (optional for EMEA)');
      }
      
      return { suggestedMode, confidence, reasons };
    }

    // COMMERCIAL: RS reps exist OR PE accounts exist
    if (dataChars.hasRenewalSpecialists || dataChars.hasPEAccounts) {
      suggestedMode = 'COMMERCIAL';
      
      if (dataChars.hasRenewalSpecialists) {
        reasons.push(`${dataChars.renewalSpecialistCount} Renewal Specialist reps found`);
      }
      
      if (dataChars.hasPEAccounts) {
        reasons.push(`${dataChars.peAccountCount} PE-owned accounts found`);
      }
      
      // High confidence if both signals present
      if (dataChars.hasRenewalSpecialists && dataChars.hasPEAccounts) {
        confidence = 'high';
      } else {
        confidence = 'medium';
      }
      
      return { suggestedMode, confidence, reasons };
    }

    // ENT: Default for AMER/GLOBAL without RS/PE data
    suggestedMode = 'ENT';
    reasons.push('Build region is AMER/GLOBAL');
    reasons.push('No Renewal Specialists or PE accounts detected');
    
    // ENT is default, so high confidence
    confidence = 'high';

    return { suggestedMode, confidence, reasons };
  } catch (error) {
    console.error('[ModeDetection] Error detecting mode:', error);
    
    // Default to ENT on error
    return {
      suggestedMode: 'ENT',
      confidence: 'low',
      reasons: ['Unable to detect mode, defaulting to Enterprise']
    };
  }
}

/**
 * Get build information
 */
async function getBuildInfo(buildId: string): Promise<BuildInfo> {
  const { data, error } = await supabase
    .from('builds')
    .select('region')
    .eq('id', buildId)
    .single();

  if (error) {
    console.error('[ModeDetection] Error fetching build:', error);
    return { region: 'AMER' }; // Default to AMER
  }

  return { region: data?.region || 'AMER' };
}

/**
 * Get data characteristics for mode detection
 */
async function getDataCharacteristics(buildId: string): Promise<DataCharacteristics> {
  // Check for Renewal Specialists
  const { count: rsCount } = await supabase
    .from('sales_reps')
    .select('*', { count: 'exact', head: true })
    .eq('build_id', buildId)
    .eq('is_renewal_specialist', true);

  // Check for PE accounts
  const { count: peCount } = await supabase
    .from('accounts')
    .select('*', { count: 'exact', head: true })
    .eq('build_id', buildId)
    .not('pe_firm', 'is', null);

  // Check for sub-regions
  const { count: subRegionCount } = await supabase
    .from('sales_reps')
    .select('*', { count: 'exact', head: true })
    .eq('build_id', buildId)
    .not('sub_region', 'is', null);

  return {
    hasRenewalSpecialists: (rsCount || 0) > 0,
    hasPEAccounts: (peCount || 0) > 0,
    hasSubRegions: (subRegionCount || 0) > 0,
    renewalSpecialistCount: rsCount || 0,
    peAccountCount: peCount || 0,
    subRegionCount: subRegionCount || 0
  };
}

/**
 * Get a human-readable label for an assignment mode
 */
export function getModeLabel(mode: AssignmentMode): string {
  switch (mode) {
    case 'ENT':
      return 'Enterprise';
    case 'COMMERCIAL':
      return 'Commercial';
    case 'EMEA':
      return 'EMEA';
    case 'CUSTOM':
      return 'Custom';
    default:
      return mode;
  }
}

/**
 * Get a description for an assignment mode
 */
export function getModeDescription(mode: AssignmentMode): string {
  switch (mode) {
    case 'ENT':
      return 'Standard enterprise account assignment with geographic and continuity priorities';
    case 'COMMERCIAL':
      return 'Commercial mode with Renewal Specialist routing and PE firm protection';
    case 'EMEA':
      return 'EMEA regional routing with sub-region assignments (DACH, UKI, etc.)';
    case 'CUSTOM':
      return 'Custom priority configuration';
    default:
      return '';
  }
}

