// Auto-mapping utilities for CSV field mapping to database schema

import * as stringSimilarity from 'string-similarity';

// Interface for auto-mapping results
export interface AutoMappingResult {
  schemaField: string;
  confidence: number;
  matchType: string;
}

// Interface for field aliases with patterns and metadata
export interface FieldAlias {
  schemaField: string;
  aliases: string[];
  patterns: RegExp[];
  required: boolean;
}

// Account field aliases - using exact database field names
export const ACCOUNT_FIELD_ALIASES: FieldAlias[] = [
  {
    schemaField: 'sfdc_account_id',
    aliases: [
      'Account ID (18)', 'Account_ID', 'AccountID', 'Account ID', 'Acct_ID', 'SFDC_Account_ID', 'AccountId',
      'Account_Id', 'acc_id', 'account_identifier', 'sf_account_id', 'salesforce_account_id'
    ],
    patterns: [/.*account.*id.*/i, /.*acct.*id.*/i, /.*acc.*id.*/i],
    required: true
  },
  {
    schemaField: 'account_name',
    aliases: [
      'Account Name', 'Account_Name', 'AccountName', 'Company Name', 'Acct_Name', 'Company_Name',
      'account_name', 'company', 'organization', 'org_name', 'customer_name',
      'client_name', 'business_name'
    ],
    patterns: [/.*account.*name.*/i, /.*company.*name.*/i, /.*org.*name.*/i],
    required: true
  },
  {
    schemaField: 'ultimate_parent_id',
    aliases: [
      'Financial Ultimate Parent: Account ID (18)', 'Ultimate_Parent_Id', 'UltimateParentId', 'Parent_Account_ID', 'Parent_ID', 'Ultimate Parent Id',
      'ultimate_parent_id', 'parent_account_id', 'parent_id', 'global_parent_id',
      'corporate_parent_id', 'holding_company_id', 'Ultimate parent 18 Digit ID'
    ],
    patterns: [/.*parent.*id.*/i, /.*ultimate.*id.*/i],
    required: false
  },
  {
    schemaField: 'ultimate_parent_name',
    aliases: [
      'Financial Ultimate Parent: Account Name', 'Ultimate_Parent_Name', 'UltimateParentName', 'Parent_Account_Name', 'Parent_Name', 'Ultimate Parent Name',
      'ultimate_parent_name', 'parent_account_name', 'parent_name', 'global_parent_name',
      'corporate_parent_name', 'holding_company_name', 'Ultimate Parent Account Owner'
    ],
    patterns: [/.*parent.*name.*/i, /.*ultimate.*name.*/i],
    required: false
  },
  // Enhanced pattern specificity for owner fields to prevent ID/name confusion
  {
    schemaField: 'owner_name',
    aliases: [
      'Account Owner: Full Name', 'Owner_Full_Name', 'Account_Owner', 'Sales_Rep', 'Rep_Name', 'Owner_Name', 'Owner Full Name',
      'account_owner', 'sales_rep', 'rep_name', 'owner_name', 'sales_person',
      'account_manager', 'relationship_manager', 'sales_owner', 'Ultimate Parent Account Owner'
    ],
    patterns: [/.*owner.*(?:full\s*)?name.*/i, /.*sales.*rep(?!.*id).*/i, /.*account.*manager(?!.*id).*/i],
    required: false
  },
  {
    schemaField: 'owner_id',
    aliases: [
      'Account Owner User ID', 'Owner_ID', 'OwnerId', 'Account_Owner_ID', 'Sales_Rep_ID', 'Rep_ID', 'Owner ID',
      'owner_id', 'account_owner_id', 'sales_rep_id', 'rep_id', 'sales_person_id',
      'account_manager_id', 'relationship_manager_id', 'Account Owner: User ID'
    ],
    patterns: [/.*owner.*id.*/i, /.*sales.*rep.*id.*/i, /.*rep.*id(?!.*name).*/i],
    required: false
  },
  {
    schemaField: 'hq_country',
    aliases: [
      'HQ Country', 'Billing_Country', 'HQ_Country', 'Country', 'Headquarters_Country', 'Billing Country (HQ Country)',
      'billing_country', 'hq_country', 'country', 'headquarters_country',
      'primary_country', 'main_country', 'base_country', 'location_country'
    ],
    patterns: [/.*country.*/i, /.*billing.*country.*/i, /.*hq.*country.*/i],
    required: false
  },
  {
    schemaField: 'sales_territory',
    aliases: [
      'ROE Sales Territory', 'Sales_Territory', 'Territory', 'Territory_Code', 'Territory_Name', 'Sales Territory',
      'sales_territory', 'territory', 'territory_code', 'territory_name',
      'assigned_territory', 'coverage_territory', 'sales_territory_name'
    ],
    patterns: [/.*territory.*/i, /.*assigned.*territory.*/i],
    required: false
  },
  {
    schemaField: 'geo',
    aliases: [
      'GEO', 'Geography', 'Geo_Region', 'Geographic_Region', 'Market_Geo',
      'geo', 'geography', 'geo_region', 'geographic_region', 'market_geo',
      'global_region', 'world_region', 'Region', 'Sales_Region', 'Market_Region'
    ],
    patterns: [/^geo$/i, /.*geography.*/i, /.*geo.*region.*/i, /^region$/i, /.*sales.*region.*/i],
    required: false
  },
    {
      schemaField: 'employees',
      aliases: [
        'ROE Employee Count', 'Employee_Count', 'Employees', 'Employee_Size', 'Number_of_Employees', 'Employee Count (Account)',
        'employee_count', 'employees', 'employee_size', 'number_of_employees',
        'staff_count', 'headcount', 'team_size', 'workforce'
      ],
      patterns: [/.*employee.*count.*/i, /.*employees.*/i, /.*headcount.*/i],
      required: false
    },
  // DEPRECATED: ultimate_parent_employee_size - removed in v1.3.9, see MASTER_LOGIC.mdc Appendix
  {
    schemaField: 'is_customer',
    aliases: [
      'Is_Customer', 'Customer', 'Is_Existing_Customer', 'Customer_Status', 'Is Customer (Y/N)',
      'is_customer', 'customer', 'is_existing_customer', 'customer_status',
      'existing_customer', 'current_customer', 'active_customer'
    ],
    patterns: [/.*customer.*/i, /.*is.*customer.*/i],
    required: false
  },
  {
    schemaField: 'arr',
    aliases: [
      'Bookings Account ARR', 'Bookings Account ARR (converted)', 
      'ARR', 'Annual_Recurring_Revenue', 'Current_ARR', 'Revenue', 'ARR (current)',
      'arr', 'annual_recurring_revenue', 'current_arr', 'revenue',
      'annual_revenue', 'yearly_revenue', 'recurring_revenue'
    ],
    patterns: [/^bookings.*arr.*/i, /^arr$/i, /.*annual.*revenue.*/i, /.*recurring.*revenue.*/i],
    required: false
  },
  {
    schemaField: 'hierarchy_bookings_arr_converted',
    aliases: [
      'Hierarchy Bookings ARR', 'Hierarchy Bookings Account ARR (converted)', 
      'Hierarchy_Bookings_ARR', 'Hierarchy ARR', 'Hierarchy_ARR',
      'hierarchy_bookings_arr', 'hierarchy_bookings_arr_converted', 'hierarchy_arr'
    ],
    patterns: [/.*hierarchy.*bookings.*arr.*/i, /.*hierarchy.*arr.*/i],
    required: false
  },
    {
      schemaField: 'expansion_tier',
      aliases: [
        'Expansion Prioritization Tier', 'Expansion_Tier', 'ExpansionTier', 'Expansion Tier',
        'expansion_tier', 'expansion_prioritization_tier',
        'Financial Ultimate Parent: Expansion Prioritization Tier'
      ],
      patterns: [/^expansion.*prioritization.*tier$/i, /^expansion.*tier$/i],
      required: false
    },
  // DEPRECATED: account_type, industry, expansion_score - removed in v1.3.9, see MASTER_LOGIC.mdc Appendix
    {
      schemaField: 'initial_sale_tier',
      aliases: [
        'Initial Sale Prioritization Tier', 'Initial_Sale_Tier', 'Initial Sale Tier',
        'initial_sale_tier', 'initial_sale_prioritization_tier',
        'Financial Ultimate Parent: Initial Sale Prioritization Tier'
      ],
      patterns: [/^initial.*sale.*prioritization.*tier$/i, /^initial.*sale.*tier$/i],
      required: false
    },
  // DEPRECATED: initial_sale_score - removed in v1.3.9, see MASTER_LOGIC.mdc Appendix
  {
    schemaField: 'parent_id',
    aliases: [
      'Parent_ID', 'ParentId', 'Direct_Parent_ID', 'Parent ID', 'Direct Parent ID',
      'parent_id', 'direct_parent_id', 'immediate_parent_id'
    ],
    patterns: [/^parent.*id$/i, /.*direct.*parent.*id.*/i],
    required: false
  },
  {
    schemaField: 'atr',
    aliases: [
      'ATR', 'Annual_Total_Revenue', 'Total_Revenue', 'Annual Revenue', 'Total Revenue',
      'atr', 'annual_total_revenue', 'total_revenue', 'annual_revenue'
    ],
    patterns: [/^atr$/i, /.*annual.*total.*revenue.*/i, /.*total.*revenue.*/i],
    required: false
  },
  {
    schemaField: 'renewal_date',
    aliases: [
      'Renewal_Date', 'RenewalDate', 'Contract_Renewal', 'Next_Renewal', 'Renewal Date',
      'renewal_date', 'contract_renewal', 'next_renewal', 'renewal_due_date'
    ],
    patterns: [/.*renewal.*date.*/i, /.*contract.*renewal.*/i],
    required: false
  },
  {
    schemaField: 'has_customer_hierarchy',
    aliases: [
      'Has_Customer_Hierarchy', 'Customer_Hierarchy', 'Has Customer Hierarchy', 'Has Hierarchy',
      'has_customer_hierarchy', 'customer_hierarchy', 'has_hierarchy'
    ],
    patterns: [/.*customer.*hierarchy.*/i, /.*has.*hierarchy.*/i],
    required: false
  },
  // DEPRECATED: in_customer_hierarchy, include_in_emea - removed in v1.3.9, see MASTER_LOGIC.mdc Appendix
  {
    schemaField: 'is_parent',
    aliases: [
      'Is_Parent', 'Parent_Account', 'Is Parent', 'Parent Flag',
      'is_parent', 'parent_account', 'parent_flag'
    ],
    patterns: [/.*is.*parent.*/i, /.*parent.*flag.*/i],
    required: false
  },
  // DEPRECATED: is_2_0 - removed in v1.3.9, see MASTER_LOGIC.mdc Appendix
  {
    schemaField: 'owners_lifetime_count',
    aliases: [
      'Owners_Lifetime_Count', 'Lifetime_Owners', 'Owner Count Lifetime', 'Total Owners',
      'owners_lifetime_count', 'lifetime_owners', 'total_owners', 'owner_count_lifetime'
    ],
    patterns: [/.*owners.*lifetime.*/i, /.*lifetime.*owners.*/i],
    required: false
  },
  // DEPRECATED: inbound_count, idr_count - removed in v1.3.9, see MASTER_LOGIC.mdc Appendix
  {
    schemaField: 'risk_flag',
    aliases: [
      'Risk_Flag', 'At_Risk', 'Risk Flag', 'At Risk', 'High Risk',
      'risk_flag', 'at_risk', 'high_risk', 'is_at_risk'
    ],
    patterns: [/.*risk.*flag.*/i, /.*at.*risk.*/i],
    required: false
  },
  {
    schemaField: 'owner_change_date',
    aliases: [
      'owner_change_date', 'owner change date', 'last_owner_change', 'edit_date', 'edit date',
      'Owner_Change_Date', 'Last_Owner_Change', 'Edit_Date'
    ],
    patterns: [/.*owner.*change.*date.*/i, /^edit.?date$/i],
    required: false
  },
  {
    schemaField: 'cre_risk',
    aliases: [
      'CRE_Risk', 'CRE_Flag', 'CRE Risk', 'CRE Flag', 'Commercial Risk',
      'cre_risk', 'cre_flag', 'commercial_risk'
    ],
    patterns: [/.*cre.*risk.*/i, /.*commercial.*risk.*/i],
    required: false
  },
  {
    schemaField: 'pe_firm',
    aliases: [
      'Related Partner Account: Related Partner Account Name', 'Related Partner Account Name',
      'PE_Firm', 'PE Firm', 'Private_Equity_Firm', 'Private Equity Firm',
      'pe_firm', 'private_equity_firm', 'partner_account', 'Partner Account',
      'Related Partner Account', 'PE Owner', 'PE_Owner', 'pe_owner'
    ],
    patterns: [/.*related.*partner.*account.*/i, /.*pe.*firm.*/i, /.*private.*equity.*/i, /.*partner.*account.*/i],
    required: false
  },
  {
    schemaField: 'is_strategic',
    aliases: [
      'Is_Strategic', 'Is Strategic', 'Strategic', 'Strategic_Account', 'Strategic Account',
      'is_strategic', 'strategic', 'strategic_account', 'is_strategic_account'
    ],
    patterns: [/.*is.*strategic.*/i, /^strategic$/i, /.*strategic.*account.*/i],
    required: false
  }
];

// Opportunity field aliases (for future use)
export const OPPORTUNITY_FIELD_ALIASES: FieldAlias[] = [
  {
    schemaField: 'sfdc_opportunity_id',
    aliases: [
      'Opportunity_ID', 'OpportunityID', 'Opportunity ID', 'Opp_ID', 'SFDC_Opportunity_ID',
      'opportunity_id', 'opp_id', 'opportunity_identifier', 'sf_opportunity_id'
    ],
    patterns: [/.*opportunity.*id.*/i, /.*opp.*id.*/i],
    required: true
  },
  {
    schemaField: 'sfdc_account_id',
    aliases: [
      'Account_ID', 'AccountID', 'Account ID', 'Related_Account_ID',
      'account_id', 'related_account_id', 'parent_account_id'
    ],
    patterns: [/.*account.*id.*/i],
    required: true
  },
  // DEPRECATED: stage, amount, close_date, created_date - removed in v1.3.9, see MASTER_LOGIC.mdc Appendix
    {
      schemaField: 'owner_id',
      aliases: [
        'Opportunity Owner', 'Owner_ID', 'OwnerId', 'Opportunity_Owner_ID', 'Sales_Rep_ID', 'Rep_ID', 'Opp Owner ID',
        'opportunity owner', 'owner_id', 'opportunity_owner_id', 'sales_rep_id', 'rep_id'
      ],
      patterns: [/.*owner.*id.*/i, /.*rep.*id(?!.*name).*/i, /.*opp.*owner.*id.*/i],
      required: false
    },
    {
      schemaField: 'owner_name',
      aliases: [
        'Opportunity Owner', 'Owner_Name', 'Opportunity_Owner_Name', 'Sales_Rep_Name', 'Rep_Name', 'REP Name',
        'opportunity owner', 'owner_name', 'opportunity_owner_name', 'sales_rep_name', 'rep_name'
      ],
      patterns: [/.*owner.*(?:full\s*)?name.*/i, /.*rep.*name(?!.*id).*/i, /.*opp.*owner.*name.*/i],
      required: false
    },
  {
    schemaField: 'cre_status',
    aliases: [
      'CRE_Status', 'CRE Status', 'Customer_Risk', 'Risk_Status', 'CRE_Flag',
      'cre_status', 'customer_risk', 'risk_status', 'cre_flag', 'renewal_risk'
    ],
    patterns: [/.*cre.*status.*/i, /.*customer.*risk.*/i, /.*renewal.*risk.*/i],
    required: false
  },
  {
    schemaField: 'renewal_event_date',
    aliases: [
      'Renewal_Event_Date', 'Renewal Event Date', 'Contract_Renewal_Date', 'Renewal_Date',
      'renewal_event_date', 'contract_renewal_date', 'renewal_date', 'contract_expiry',
      'contract_end_date', 'renewal_due_date'
    ],
    patterns: [/.*renewal.*event.*date.*/i, /.*contract.*renewal.*/i, /.*renewal.*date.*/i],
    required: false
  },
  {
    schemaField: 'net_arr',
    aliases: [
      'Net ARR (converted)', 'Net_ARR_converted', 'Net_ARR', 'Net ARR', 'Net_Annual_Recurring_Revenue', 'NARR', 'Net_Revenue',
      'net arr (converted)', 'net_arr_converted', 'net_arr', 'net_annual_recurring_revenue', 'narr', 'net_revenue'
    ],
    patterns: [/net.*arr.*converted/i, /.*net.*arr.*/i, /.*net.*annual.*revenue.*/i, /.*narr.*/i],
    required: false
  },
  {
    schemaField: 'opportunity_name',
    aliases: [
      'Opportunity_Name', 'Opportunity Name', 'Opp_Name', 'Deal_Name', 'Name',
      'opportunity_name', 'opp_name', 'deal_name', 'opportunity_title'
    ],
    patterns: [/.*opportunity.*name.*/i, /.*opp.*name.*/i, /.*deal.*name.*/i],
    required: false
  },
  {  
    schemaField: 'opportunity_type',
    aliases: [
      'Opportunity_Type', 'Opportunity Type', 'Opp_Type', 'Deal_Type', 'Type',
      'opportunity_type', 'opp_type', 'deal_type', 'opportunity_category'
    ],
    patterns: [/.*opportunity.*type.*/i, /.*opp.*type.*/i, /.*deal.*type.*/i],
    required: false
  },
  {
    schemaField: 'available_to_renew',
    aliases: [
      'Available to Renew (converted)', 'Available To Renew (converted)',
      'Available_To_Renew', 'Available To Renew', 'ATR', 'Renewable_Amount', 'Renewal_Value',
      'available_to_renew', 'atr', 'renewable_amount', 'renewal_value', 'available_for_renewal',
      'Bookings Account ARR (converted)'
    ],
    patterns: [/^available.*to.*renew(?!.*currency)/i, /.*atr.*/i, /.*renewable.*amount.*/i, /^bookings.*arr.*converted\)$/i],
    required: false
  }
];

// Sales Rep field aliases (for future use)
export const SALES_REP_FIELD_ALIASES: FieldAlias[] = [
  {
    schemaField: 'rep_id',
    aliases: [
      'Rep_ID', 'RepId', 'Sales_Rep_ID', 'Employee_ID', 'User_ID', 'SFDC_ID', 'SFDC ID',
      'rep_id', 'sales_rep_id', 'employee_id', 'user_id', 'sfdc_id', 'sfdc id'
    ],
    patterns: [/.*rep.*id.*/i, /.*employee.*id.*/i, /.*sfdc.*id.*/i],
    required: true
  },
  {
    schemaField: 'name',
    aliases: [
      'Name', 'Rep_Name', 'Full_Name', 'Sales_Rep_Name', 'Employee_Name', 'REP',
      'name', 'rep_name', 'full_name', 'sales_rep_name', 'employee_name', 'rep'
    ],
    patterns: [/.*name.*/i, /^rep$/i],
    required: true
  },
  // DEPRECATED: manager - removed in v1.3.9, use flm/slm instead. See MASTER_LOGIC.mdc Appendix
  {
    schemaField: 'team',
    aliases: [
      'Team', 'Sales_Team', 'Team_Name', 'Department',
      'team', 'sales_team', 'team_name', 'department'
    ],
    patterns: [/.*team.*/i, /.*department.*/i],
    required: false
  },
  {
    schemaField: 'region',
    aliases: [
      'Region', 'Sales_Region', 'Territory', 'Geographic_Region',
      'region', 'sales_region', 'territory', 'geographic_region'
    ],
    patterns: [/.*region.*/i, /.*territory.*/i],
    required: false
  },
  {
    schemaField: 'flm',
    aliases: [
      'FLM', 'First_Level_Manager', 'First Level Manager', 'Direct_Manager', 'Immediate_Manager',
      'flm', 'first_level_manager', 'direct_manager', 'immediate_manager', 'line_manager'
    ],
    patterns: [/.*flm.*/i, /.*first.*level.*manager.*/i, /.*direct.*manager.*/i],
    required: false
  },
  {
    schemaField: 'slm',
    aliases: [
      'SLM', 'Second_Level_Manager', 'Second Level Manager', 'Senior_Manager', 'Regional_Manager',
      'slm', 'second_level_manager', 'senior_manager', 'regional_manager', 'area_manager'
    ],
    patterns: [/.*slm.*/i, /.*second.*level.*manager.*/i, /.*senior.*manager.*/i],
    required: false
  },
  {
    schemaField: 'team_tier',
    aliases: [
      'Team_Tier', 'TeamTier', 'Team Tier', 'Segment', 'Rep_Tier', 'Size_Tier', 'Tier',
      'team_tier', 'segment', 'rep_tier', 'size_tier', 'tier'
    ],
    patterns: [/.*team.*tier.*/i, /.*size.*tier.*/i, /.*rep.*tier.*/i, /^segment$/i],
    required: false
  },
  {
    schemaField: 'is_strategic_rep',
    aliases: [
      'Is_Strategic_Rep', 'Is Strategic Rep', 'Strategic_Rep', 'Strategic Rep', 'Is_Strategic',
      'is_strategic_rep', 'strategic_rep', 'is_strategic', 'strategic'
    ],
    patterns: [/.*is.*strategic.*rep.*/i, /.*strategic.*rep.*/i, /^is.*strategic$/i],
    required: false
  }
];

// Calculate similarity between two strings using string-similarity library
export const calculateSimilarity = (str1: string, str2: string): number => {
  return stringSimilarity.compareTwoStrings(str1.toLowerCase(), str2.toLowerCase());
};

// Find exact matches between CSV field and aliases
export const findExactMatches = (csvField: string, fieldAliases: FieldAlias[]): AutoMappingResult[] => {
  const matches: AutoMappingResult[] = [];
  
  for (const fieldAlias of fieldAliases) {
    for (const alias of fieldAlias.aliases) {
      if (csvField.toLowerCase() === alias.toLowerCase()) {
        matches.push({
          schemaField: fieldAlias.schemaField,
          confidence: 1.0,
          matchType: 'exact'
        });
      }
    }
  }
  
  return matches;
};

// Find partial matches (contains keyword)
export const findPartialMatches = (csvField: string, fieldAliases: FieldAlias[]): AutoMappingResult[] => {
  const matches: AutoMappingResult[] = [];
  
  for (const fieldAlias of fieldAliases) {
    for (const alias of fieldAlias.aliases) {
      if (csvField.toLowerCase().includes(alias.toLowerCase()) || 
          alias.toLowerCase().includes(csvField.toLowerCase())) {
        matches.push({
          schemaField: fieldAlias.schemaField,
          confidence: 0.8,
          matchType: 'partial'
        });
      }
    }
  }
  
  return matches;
};

// Find pattern matches using regular expressions
export const findPatternMatches = (csvField: string, fieldAliases: FieldAlias[]): AutoMappingResult[] => {
  const matches: AutoMappingResult[] = [];
  
  for (const fieldAlias of fieldAliases) {
    for (const pattern of fieldAlias.patterns) {
      if (pattern.test(csvField)) {
        matches.push({
          schemaField: fieldAlias.schemaField,
          confidence: 0.7,
          matchType: 'pattern'
        });
      }
    }
  }
  
  return matches;
};

// Find fuzzy matches based on string similarity
export const findFuzzyMatches = (csvField: string, fieldAliases: FieldAlias[], threshold: number = 0.6): AutoMappingResult[] => {
  const matches: AutoMappingResult[] = [];
  
  for (const fieldAlias of fieldAliases) {
    for (const alias of fieldAlias.aliases) {
      const similarity = calculateSimilarity(csvField, alias);
      if (similarity >= threshold) {
        matches.push({
          schemaField: fieldAlias.schemaField,
          confidence: similarity * 0.6, // Scale down fuzzy match confidence
          matchType: 'fuzzy'
        });
      }
    }
  }
  
  return matches;
};

// Enhanced auto-mapping function with conflict resolution
export const autoMapFields = (
  csvHeaders: string[], 
  fileType: 'accounts' | 'opportunities' | 'sales_reps'
): { [csvField: string]: { schemaField: string; confidence: number; matchType: string } } => {
  let fieldAliases: FieldAlias[];
  
  switch (fileType) {
    case 'accounts':
      fieldAliases = ACCOUNT_FIELD_ALIASES;
      break;
    case 'opportunities':
      fieldAliases = OPPORTUNITY_FIELD_ALIASES;
      break;
    case 'sales_reps':
      fieldAliases = SALES_REP_FIELD_ALIASES;
      break;
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
  
  const mappings: { [csvField: string]: { schemaField: string; confidence: number; matchType: string } } = {};
  const usedSchemaFields = new Set<string>(); // Track used schema fields to prevent duplicates
  
  // First pass: Handle exact matches (highest priority)
  for (const csvField of csvHeaders) {
    const exactMatches = findExactMatches(csvField, fieldAliases)
      .filter(match => !usedSchemaFields.has(match.schemaField))
      .sort((a, b) => b.confidence - a.confidence);
    
    if (exactMatches.length > 0) {
      const bestMatch = exactMatches[0];
      mappings[csvField] = bestMatch;
      usedSchemaFields.add(bestMatch.schemaField);
      console.log(`🎯 Exact match: "${csvField}" → ${bestMatch.schemaField} (${bestMatch.confidence})`);
      
      // Special logging for ultimate_parent_id
      if (bestMatch.schemaField === 'ultimate_parent_id') {
        console.log(`🔑 ULTIMATE_PARENT_ID MAPPED:`, {
          csvField,
          schemaField: bestMatch.schemaField,
          confidence: bestMatch.confidence,
          matchType: bestMatch.matchType
        });
      }
    }
  }
  
  // Second pass: Handle pattern matches with enhanced conflict resolution
  for (const csvField of csvHeaders) {
    if (mappings[csvField]) continue; // Already mapped
    
    const patternMatches = findPatternMatches(csvField, fieldAliases)
      .filter(match => !usedSchemaFields.has(match.schemaField))
      .sort((a, b) => b.confidence - a.confidence);
    
    // Enhanced specificity check for owner fields
    if (patternMatches.length > 1) {
      const ownerNameMatch = patternMatches.find(m => m.schemaField === 'owner_name');
      const ownerIdMatch = patternMatches.find(m => m.schemaField === 'owner_id');
      
      if (ownerNameMatch && ownerIdMatch) {
        // Use more specific matching for owner fields
        if (/(?:full\s*name|rep\s*name|owner\s*name)/i.test(csvField) && !/id/i.test(csvField)) {
          // Field contains "name" but not "id" - prefer owner_name
          mappings[csvField] = ownerNameMatch;
          usedSchemaFields.add(ownerNameMatch.schemaField);
          console.log(`🎯 Smart match: "${csvField}" → owner_name (name-specific)`);
          continue;
        } else if (/(?:owner.*id|rep.*id|user.*id)/i.test(csvField) && !/name/i.test(csvField)) {
          // Field contains "id" but not "name" - prefer owner_id
          mappings[csvField] = ownerIdMatch;
          usedSchemaFields.add(ownerIdMatch.schemaField);
          console.log(`🎯 Smart match: "${csvField}" → owner_id (id-specific)`);
          continue;
        }
      }
    }
    
    if (patternMatches.length > 0) {
      const bestMatch = patternMatches[0];
      mappings[csvField] = bestMatch;
      usedSchemaFields.add(bestMatch.schemaField);
      console.log(`🎯 Pattern match: "${csvField}" → ${bestMatch.schemaField} (${bestMatch.confidence})`);
    }
  }
  
  // Third pass: Handle remaining fields with partial and fuzzy matches
  for (const csvField of csvHeaders) {
    if (mappings[csvField]) continue; // Already mapped
    
    let bestMatch: AutoMappingResult | null = null;
    
    // Try partial matches
    const partialMatches = findPartialMatches(csvField, fieldAliases)
      .filter(match => !usedSchemaFields.has(match.schemaField))
      .sort((a, b) => b.confidence - a.confidence);
    
    if (partialMatches.length > 0) {
      bestMatch = partialMatches[0];
    } else {
      // Try fuzzy matches
      const fuzzyMatches = findFuzzyMatches(csvField, fieldAliases)
        .filter(match => !usedSchemaFields.has(match.schemaField))
        .sort((a, b) => b.confidence - a.confidence);
      
      if (fuzzyMatches.length > 0) {
        bestMatch = fuzzyMatches[0];
      }
    }
    
    if (bestMatch && bestMatch.confidence >= 0.5) {
      mappings[csvField] = bestMatch;
      usedSchemaFields.add(bestMatch.schemaField);
      console.log(`🎯 ${bestMatch.matchType} match: "${csvField}" → ${bestMatch.schemaField} (${bestMatch.confidence})`);
      
      // Special logging for ultimate_parent_id
      if (bestMatch.schemaField === 'ultimate_parent_id') {
        console.log(`🔑 ULTIMATE_PARENT_ID MAPPED (${bestMatch.matchType}):`, {
          csvField,
          schemaField: bestMatch.schemaField,
          confidence: bestMatch.confidence,
          matchType: bestMatch.matchType
        });
      }
    }
  }
  
  // Log summary of mappings
  console.log('📊 Final mapping summary:', {
    totalFields: csvHeaders.length,
    mappedFields: Object.keys(mappings).length,
    usedSchemaFields: Array.from(usedSchemaFields)
  });
  
  // Special check for ultimate_parent_id in final mappings
  const ultimateParentMapping = Object.entries(mappings).find(([_, mapping]) => mapping.schemaField === 'ultimate_parent_id');
  if (ultimateParentMapping) {
    console.log('🔑 ULTIMATE_PARENT_ID FINAL MAPPING:', ultimateParentMapping);
  } else {
    console.log('❌ ULTIMATE_PARENT_ID NOT MAPPED - Available CSV headers:', csvHeaders);
    console.log('🔍 Looking for headers containing "parent":', csvHeaders.filter(h => /parent/i.test(h)));
  }
  
  return mappings;
};

// Convert auto-mappings to simple field mappings format
export const convertToFieldMappings = (
  autoMappings: { [csvField: string]: { schemaField: string; confidence: number; matchType: string } }
): { [csvField: string]: string } => {
  const fieldMappings: { [csvField: string]: string } = {};
  
  for (const [csvField, mapping] of Object.entries(autoMappings)) {
    fieldMappings[csvField] = mapping.schemaField;
    
    // Debug ultimate_parent_id conversion
    if (mapping.schemaField === 'ultimate_parent_id') {
      console.log('🔄 Converting ultimate_parent_id mapping:', { csvField, schemaField: mapping.schemaField });
    }
  }
  
  console.log('📋 Final field mappings object:', fieldMappings);
  
  return fieldMappings;
};

// Get auto-mapping summary statistics
export const getAutoMappingSummary = (
  autoMappings: { [csvField: string]: { schemaField: string; confidence: number; matchType: string } },
  requiredFields: string[]
): {
  totalMapped: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  requiredFieldsMapped: number;
  requiredFieldsTotal: number;
} => {
  const mappedFields = Object.values(autoMappings);
  const mappedSchemaFields = new Set(mappedFields.map(m => m.schemaField));
  const requiredFieldsMapped = requiredFields.filter(field => mappedSchemaFields.has(field)).length;
  
  return {
    totalMapped: mappedFields.length,
    highConfidence: mappedFields.filter(m => m.confidence >= 0.8).length,
    mediumConfidence: mappedFields.filter(m => m.confidence >= 0.6 && m.confidence < 0.8).length,
    lowConfidence: mappedFields.filter(m => m.confidence < 0.6).length,
    requiredFieldsMapped,
    requiredFieldsTotal: requiredFields.length
  };
};