/**
 * Mode Detection Service
 * 
 * Auto-detects the appropriate assignment mode (ENT, COMMERCIAL, EMEA)
 * based on build region and data characteristics.
 * 
 * Note: EMEA uses the region field directly (DACH, UKI, Nordics, etc.)
 * instead of a separate sub_region field.
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
  // DEPRECATED: hasRenewalSpecialists, renewalSpecialistCount - removed in v1.3.9
  hasPEAccounts: boolean;
  hasTeamAlignmentData: boolean;  // employees in accounts + team tier values in reps
  peAccountCount: number;
  teamAlignmentAccountCount: number;
  teamAlignmentRepCount: number;
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

    // APAC: Primary signal is build region
    if (buildInfo.region === 'APAC') {
      suggestedMode = 'APAC';
      reasons.push('Build region is APAC');
      reasons.push('APAC uses same priority structure as EMEA (stability, continuity, geography, team)');
      confidence = 'high';
      
      return { suggestedMode, confidence, reasons };
    }

    // EMEA: Primary signal is build region
    if (buildInfo.region === 'EMEA') {
      suggestedMode = 'EMEA';
      reasons.push('Build region is EMEA');
      reasons.push('EMEA uses region field for routing (DACH, UKI, etc.)');
      confidence = 'high';
      
      return { suggestedMode, confidence, reasons };
    }

    // COMMERCIAL: Team Alignment data exists OR PE accounts exist
    if (dataChars.hasTeamAlignmentData || dataChars.hasPEAccounts) {
      suggestedMode = 'COMMERCIAL';
      
      if (dataChars.hasTeamAlignmentData) {
        reasons.push(`Team Alignment data found: ${dataChars.teamAlignmentAccountCount} accounts with employees, ${dataChars.teamAlignmentRepCount} reps with team tier`);
      }
      
      if (dataChars.hasPEAccounts) {
        reasons.push(`${dataChars.peAccountCount} PE-owned accounts found`);
      }
      
      // High confidence if team alignment data present (strongest signal)
      if (dataChars.hasTeamAlignmentData) {
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
  // Run all checks in parallel for performance
  // DEPRECATED: is_renewal_specialist check removed in v1.3.9
  const [peResult, employeesResult, teamResult] = await Promise.all([
    // Check for PE accounts
    supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('build_id', buildId)
      .not('pe_firm', 'is', null),
    
    // Check for accounts with employee data (for Team Alignment)
    supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('build_id', buildId)
      .eq('is_parent', true)
      .not('employees', 'is', null)
      .gt('employees', 0),
    
    // Check for reps with team tier values (SMB, Growth, MM, ENT)
    supabase
      .from('sales_reps')
      .select('*', { count: 'exact', head: true })
      .eq('build_id', buildId)
      .not('team', 'is', null)
      .in('team', ['SMB', 'Growth', 'MM', 'ENT'])
  ]);

  const peCount = peResult.count || 0;
  const employeesCount = employeesResult.count || 0;
  const teamCount = teamResult.count || 0;
  
  // Team Alignment requires BOTH employees in accounts AND team tier in reps
  const hasTeamAlignmentData = employeesCount > 0 && teamCount > 0;

  return {
    // DEPRECATED: hasRenewalSpecialists, renewalSpecialistCount - removed in v1.3.9
    hasPEAccounts: peCount > 0,
    hasTeamAlignmentData,
    peAccountCount: peCount,
    teamAlignmentAccountCount: employeesCount,
    teamAlignmentRepCount: teamCount
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
    case 'APAC':
      return 'APAC';
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
      return 'Commercial mode with FLM routing for low-ARR accounts and PE firm protection';
    case 'EMEA':
      return 'EMEA regional routing with stability, continuity, geography, and team alignment';
    case 'APAC':
      return 'APAC regional routing with stability, continuity, geography, and team alignment';
    case 'CUSTOM':
      return 'Custom priority configuration - shows all available priorities';
    default:
      return '';
  }
}
