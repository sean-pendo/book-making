/**
 * useMappedFields Hook
 * 
 * Determines which schema fields have been mapped/populated during data import.
 * Used by PriorityWaterfallConfig to determine which priorities are available.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MappedFieldsResult {
  accounts: Set<string>;
  sales_reps: Set<string>;
  opportunities: Set<string>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fields that are always available (no mapping required)
 */
const ALWAYS_AVAILABLE_FIELDS = {
  accounts: new Set([
    'sfdc_account_id',
    'account_name',
    'build_id',
    'id',
    'created_at',
    // Core account fields always available
    'owner_id',
    'owner_name',
    'sales_territory',
    'geo',
    'calculated_arr',
    'arr',
    'is_customer',
    'is_parent',
    'exclude_from_reassignment',
    'is_strategic'
  ]),
  sales_reps: new Set([
    'rep_id',
    'name',
    'build_id',
    'id',
    'created_at'
  ]),
  opportunities: new Set([
    'sfdc_opportunity_id',
    'sfdc_account_id',
    'build_id',
    'id',
    'created_at'
  ])
};

/**
 * Hook to get mapped fields for a build
 * 
 * Checks both import_metadata.field_mappings and actual data presence
 * to determine which fields are available for priority configuration.
 */
export function useMappedFields(buildId: string | undefined): MappedFieldsResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['mapped-fields', buildId],
    queryFn: async () => {
      if (!buildId) {
        return {
          accounts: ALWAYS_AVAILABLE_FIELDS.accounts,
          sales_reps: ALWAYS_AVAILABLE_FIELDS.sales_reps,
          opportunities: ALWAYS_AVAILABLE_FIELDS.opportunities
        };
      }

      // Get import metadata to see what was mapped
      const { data: importMetadata, error: metaError } = await supabase
        .from('import_metadata')
        .select('data_type, field_mappings')
        .eq('build_id', buildId);

      if (metaError) {
        console.error('[useMappedFields] Error loading import metadata:', metaError);
      }

      // Build mapped fields from import metadata
      const mappedFromImport = {
        accounts: new Set<string>(),
        sales_reps: new Set<string>(),
        opportunities: new Set<string>()
      };

      importMetadata?.forEach(meta => {
        const dataType = meta.data_type as keyof typeof mappedFromImport;
        const mappings = meta.field_mappings as Record<string, string> | null;
        
        if (mappings && mappedFromImport[dataType]) {
          Object.values(mappings).forEach(schemaField => {
            if (schemaField) {
              mappedFromImport[dataType].add(schemaField);
            }
          });
        }
      });

      // Also check for actual data presence for critical fields
      // This catches fields that may have been populated outside of import
      const [accountFields, repFields] = await Promise.all([
        checkAccountFieldPresence(buildId),
        checkSalesRepFieldPresence(buildId)
      ]);

      // Merge all sources
      const result = {
        accounts: new Set([
          ...ALWAYS_AVAILABLE_FIELDS.accounts,
          ...mappedFromImport.accounts,
          ...accountFields
        ]),
        sales_reps: new Set([
          ...ALWAYS_AVAILABLE_FIELDS.sales_reps,
          ...mappedFromImport.sales_reps,
          ...repFields
        ]),
        opportunities: new Set([
          ...ALWAYS_AVAILABLE_FIELDS.opportunities,
          ...mappedFromImport.opportunities
        ])
      };

      return result;
    },
    enabled: !!buildId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    accounts: data?.accounts ?? ALWAYS_AVAILABLE_FIELDS.accounts,
    sales_reps: data?.sales_reps ?? ALWAYS_AVAILABLE_FIELDS.sales_reps,
    opportunities: data?.opportunities ?? ALWAYS_AVAILABLE_FIELDS.opportunities,
    isLoading,
    error: error as Error | null
  };
}

/**
 * Check which account fields have actual data
 */
async function checkAccountFieldPresence(buildId: string): Promise<Set<string>> {
  const fieldsToCheck = [
    'pe_firm',
    'cre_risk',
    'exclude_from_reassignment',
    'hierarchy_bookings_arr_converted',
    'sales_territory',
    'owner_id',
    'renewal_quarter',
    'renewal_date',  // For stability accounts - renewal soon
    'hq_country',
    'expansion_tier',
    'employees'  // For team alignment priority
  ];

  const presentFields = new Set<string>();

  // Check each field for non-null values
  for (const field of fieldsToCheck) {
    try {
      const { count, error } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId)
        .not(field, 'is', null)
        .limit(1);

      if (!error && count && count > 0) {
        presentFields.add(field);
      }
    } catch {
      // Field might not exist or other error, skip
    }
  }

  return presentFields;
}

/**
 * Check which sales_reps fields have actual data
 */
async function checkSalesRepFieldPresence(buildId: string): Promise<Set<string>> {
  // DEPRECATED: is_renewal_specialist, sub_region - removed in v1.3.9
  // DEPRECATED: team - removed in v1.4.1, use team_tier instead
  const fieldsToCheck = [
    'region',
    'is_strategic_rep',
    'flm',
    'slm',
    'team_tier'  // For team alignment priority (SMB/Growth/MM/ENT)
  ];

  const presentFields = new Set<string>();

  // Check each field for non-null/non-default values
  for (const field of fieldsToCheck) {
    try {
      let query = supabase
        .from('sales_reps')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId)
        .not(field, 'is', null);
      
      // For boolean fields, also check if any are true
      if (field === 'is_strategic_rep') {
        query = supabase
          .from('sales_reps')
          .select('*', { count: 'exact', head: true })
          .eq('build_id', buildId)
          .eq(field, true);
      }

      const { count, error } = await query.limit(1);

      if (!error && count && count > 0) {
        presentFields.add(field);
      }
    } catch {
      // Field might not exist or other error, skip
    }
  }

  return presentFields;
}

/**
 * Utility to check if a specific field is mapped
 */
export function isFieldMapped(
  mappedFields: MappedFieldsResult,
  table: 'accounts' | 'sales_reps' | 'opportunities',
  field: string
): boolean {
  return mappedFields[table].has(field);
}

