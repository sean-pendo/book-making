// Import utility functions for CSV parsing and validation
import { supabase } from '@/integrations/supabase/client';
import { BatchImportService } from '@/services/batchImportService';
import { StreamingCsvParser } from '@/services/streamingCsvParser';
import { autoMapTerritoryToRegion } from './territoryAutoMapping';

export interface CSVParseResult<T> {
  data: T[];
  errors: string[];
  totalRows: number;
  validRows: number;
  headers: string[];
}

export interface ImportResult {
  success: boolean;
  recordsProcessed: number;
  recordsImported: number;
  errors: string[];
}

export interface AccountImportRow {
  AccountId: string;
  'Account Name': string;
  'Ultimate Parent Id'?: string;
  'Ultimate Parent Name'?: string;
  'Owner Full Name'?: string;
  'Owner ID': string;
  'Sales Manager Name'?: string;
  'Billing Country (HQ Country)'?: string;
  'Sales Territory'?: string;
  GEO?: string;
  'Employee Count (Account)'?: number;
  'Employee Count (Ultimate Parent)'?: number;
  'Is Customer (Y/N)'?: boolean;
  'ARR (current)'?: number;
  'Owner Name'?: string;
  'Expansion Tier'?: string;
  'Initial Sale Tier'?: string;
  Type?: string;
}

export interface OpportunityImportRow {
  OpportunityId: string;
  AccountId: string;
  Stage: string;
  Amount: number;
  CloseDate: string;
  CreatedDate: string;
  OwnerId: string;
  'Owner Name': string;
}

export interface SalesRepImportRow {
  RepId: string;
  Name: string;
  Manager?: string;
  Team?: string;
  Region?: string;
}

// Enhanced CSV parsing with better error handling - now uses EnhancedCSVParser
import { EnhancedCSVParser } from './enhancedCsvParser';

export const parseCSV = <T>(csvText: string, expectedHeaders?: string[]): CSVParseResult<T> => {
  console.log('🔍 Enhanced CSV parsing started');
  
  try {
    const result = EnhancedCSVParser.parseCSV(csvText, expectedHeaders);
    
    // Convert to legacy format for backward compatibility
    const legacyErrors = result.errors.map(err => 
      `Row ${err.row}: [${err.severity.toUpperCase()}] ${err.message}`
    );
    
    console.log('✅ Enhanced CSV parsing completed:', {
      totalRows: result.totalRows,
      validRows: result.validRows,
      errorCount: result.errors.length,
      warningCount: result.warnings.length
    });
    
    return {
      data: result.data as T[],
      errors: legacyErrors,
      totalRows: result.totalRows,
      validRows: result.validRows,
      headers: result.headers
    };
  } catch (error) {
    console.error('❌ Enhanced CSV parsing failed:', error);
    
    // Fallback to basic parsing
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    const errors: string[] = [];
    const data: T[] = [];
    
    if (headers.length === 0) {
      errors.push('No headers found in CSV file');
      return { data, errors, totalRows: 0, validRows: 0, headers };
    }

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const rowData: any = {};
        
        headers.forEach((header, index) => {
          const value = values[index];
          rowData[header] = value || '';
        });

        data.push(rowData as T);
      } catch (parseError) {
        errors.push(`Row ${i + 1}: Parse error - ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }
    }

    return {
      data,
      errors,
      totalRows: lines.length - 1,
      validRows: data.length,
      headers
    };
  }
};

// Enhanced validation result interface
export interface ValidationSummary {
  validData: any[];
  errors: string[];
  warnings: string[];
  criticalErrors: string[];
  totalRows: number;
  validRows: number;
}

// Validate data after field mapping with improved error handling
export const validateMappedData = (
  data: any[], 
  fieldMappings: { [csvField: string]: string },
  fileType: 'accounts' | 'opportunities' | 'sales_reps'
): ValidationSummary => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const criticalErrors: string[] = [];
  const validData: any[] = [];
  
  // Debug logging for validation inputs
  console.log(`🔍 Validating ${fileType} data:`, {
    totalRows: data.length,
    fieldMappings: fieldMappings,
    sampleRow: data[0],
    csvHeaders: data.length > 0 ? Object.keys(data[0]) : []
  });
  
  // Check if ESSENTIAL fields are mapped before processing
  // Only block on truly essential fields - high-priority fields generate warnings but don't block
  let requiredFieldsForType: string[] = [];
  if (fileType === 'sales_reps') {
    // Only essential fields required for mapping
    requiredFieldsForType = ['rep_id', 'name'];
  } else if (fileType === 'accounts') {
    // Only essential fields required for mapping
    requiredFieldsForType = ['sfdc_account_id', 'account_name'];
  } else if (fileType === 'opportunities') {
    // Only essential fields required for mapping
    requiredFieldsForType = ['sfdc_opportunity_id', 'sfdc_account_id'];
  }
  
  // Check if required schema fields are mapped
  const mappedSchemaFields = Object.values(fieldMappings);
  const missingMappings = requiredFieldsForType.filter(field => 
    !mappedSchemaFields.includes(field)
  );
  
  if (missingMappings.length > 0) {
    criticalErrors.push(`Missing required field mappings: ${missingMappings.join(', ')}. Please map these fields before validation.`);
    console.error('❌ Missing required mappings:', missingMappings);
    return {
      validData: [],
      errors,
      warnings,
      criticalErrors,
      totalRows: data.length,
      validRows: 0
    };
  }
  
  data.forEach((row, index) => {
    const rowNum = index + 1;
    const mappedRow: any = {};
    let hasCriticalErrors = false;
    
    // Debug logging for first few rows
    if (index < 3) {
      console.log(`🔍 Processing row ${rowNum}:`, {
        rawRow: row,
        fieldMappings: fieldMappings
      });
    }
    
     // First, apply all field mappings to transform CSV data to database schema
     Object.entries(fieldMappings).forEach(([csvField, schemaField]) => {
       const rawValue = row[csvField];
       let processedValue = rawValue;
       
       // Debug for critical fields in first few rows
       if (index < 10 && (schemaField === 'rep_id' || schemaField === 'name' || schemaField === 'ultimate_parent_id' || schemaField === 'sfdc_account_id')) {
         console.log(`🔍 Field mapping - Row ${rowNum}:`, {
           csvField,
           schemaField,
           rawValue,
           rawValueType: typeof rawValue,
           isEmpty: rawValue === null || rawValue === undefined || rawValue === '' || (typeof rawValue === 'string' && rawValue.trim() === '')
         });
       }
      
       // Handle various empty value types more comprehensively
       if (rawValue === null || 
           rawValue === undefined || 
           rawValue === '' || 
           rawValue === 'null' || 
           rawValue === 'undefined' || 
           (typeof rawValue === 'string' && rawValue.trim() === '')) {
        mappedRow[schemaField] = null;
        
        // Debug empty values only for truly essential fields (not ultimate_parent_id - empty is valid for parent accounts)
        if (schemaField === 'rep_id' || schemaField === 'name' || schemaField === 'sfdc_account_id') {
          console.log(`⚠️ Empty value for ${schemaField} in row ${rowNum}:`, { rawValue, valueType: typeof rawValue });
        }
        return;
       }
      
      // Enhanced type conversion based on schema field name
      try {
        if (schemaField.toLowerCase().includes('amount') || 
            schemaField.toLowerCase().includes('arr') || 
            schemaField.toLowerCase().includes('atr') || 
            schemaField.toLowerCase().includes('revenue') ||
            schemaField.toLowerCase().includes('employee') ||
            schemaField === 'employees' ||
            schemaField === 'ultimate_parent_employee_size' ||
            schemaField.includes('_count')) {
          // Handle numeric fields
          const rawValueStr = rawValue.toString().trim();
          
          // Common currency codes that should be treated as null/empty
          const currencyCodes = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'BRL', 'MXN'];
          
          if (currencyCodes.includes(rawValueStr.toUpperCase())) {
            processedValue = null;
          } else if (rawValueStr === '' || rawValueStr === '0' || rawValueStr === '0.00') {
            // Keep empty/zero values as-is for amount fields (don't convert to null)
            processedValue = 0;
          } else {
            // Clean and parse numeric value
            const cleaned = rawValueStr.replace(/[$,\s]/g, '');
            const numValue = parseFloat(cleaned);
            processedValue = !isNaN(numValue) ? numValue : 0;
          }
        } else if (schemaField.toLowerCase().includes('customer') || 
                   (schemaField.toLowerCase().includes('is_') && schemaField !== 'is_parent') ||
                   schemaField.toLowerCase().includes('risk')) {
          // Handle boolean fields (exclude is_parent as it's calculated from ultimate_parent_id)
          const lowerValue = rawValue.toString().toLowerCase().trim();
          processedValue = ['true', 'yes', 'y', '1'].includes(lowerValue);
        } else if (schemaField.toLowerCase().includes('date')) {
          // Handle date fields
          try {
            const dateValue = new Date(rawValue);
            if (!isNaN(dateValue.getTime())) {
              processedValue = rawValue; // Keep as string for database
            } else {
              warnings.push(`Row ${rowNum}: Invalid date format for ${schemaField}: ${rawValue}`);
              processedValue = null;
            }
          } catch {
            warnings.push(`Row ${rowNum}: Invalid date format for ${schemaField}: ${rawValue}`);
            processedValue = null;
          }
        } else {
          // String fields - trim and handle empty strings
          // CRITICAL: Don't convert empty strings to null for ID fields that might be empty but valid
          const trimmedValue = rawValue.toString().trim();
          processedValue = trimmedValue === '' ? null : trimmedValue;
        }
      } catch (error) {
        warnings.push(`Row ${rowNum}: Type conversion error for ${schemaField}: ${rawValue}`);
        processedValue = rawValue.toString().trim() || null;
      }
      
      mappedRow[schemaField] = processedValue;
    });
    
    // Now validate required fields using the transformed database field names
    // All essential + high-priority fields must have data
    if (fileType === 'accounts') {
      // Essential fields - absolutely required, block row if missing
      const essentialFields = ['sfdc_account_id', 'account_name'];
      const missingEssential = essentialFields.filter(field => {
        const value = mappedRow[field];
        return !value || value === null || value === '' || value === 'undefined';
      });

      if (missingEssential.length > 0) {
        criticalErrors.push(`Row ${rowNum}: Missing essential fields: ${missingEssential.join(', ')}`);
        hasCriticalErrors = true;
      }

      // High priority fields - generate warnings but don't block import
      // Note: ultimate_parent_id is legitimately empty for parent accounts
      // Note: Many fields may be empty for prospects or child accounts
      const highPriorityFields = [
        'owner_id', 'owner_name', 'sales_territory'
      ];
      const missingHighPriority = highPriorityFields.filter(field => {
        const value = mappedRow[field];
        return !value || value === null || value === '' || value === 'undefined';
      });

      if (missingHighPriority.length > 0) {
        // Generate warning instead of critical error - these fields are helpful but not blocking
        warnings.push(`Row ${rowNum}: Missing high-priority fields: ${missingHighPriority.join(', ')}`);
        // DON'T set hasCriticalErrors = true - allow import to proceed
      }

      // Automatically calculate is_parent based on ultimate_parent_id
      // Parent accounts are identified by:
      // 1. ultimate_parent_id is NULL/empty, OR
      // 2. Self-referencing: sfdc_account_id = ultimate_parent_id (Salesforce pattern)
      const ultimateParentId = mappedRow['ultimate_parent_id'];
      const sfdcAccountId = mappedRow['sfdc_account_id'];

      const isNullOrEmpty = !ultimateParentId || ultimateParentId === null ||
                            (typeof ultimateParentId === 'string' && ultimateParentId.trim() === '');
      const isSelfReferencing = ultimateParentId && sfdcAccountId &&
                                ultimateParentId === sfdcAccountId;

      mappedRow['is_parent'] = isNullOrEmpty || isSelfReferencing;

      // Debug logging for first few rows
      if (index < 5) {
        console.log(`🔍 Row ${rowNum} is_parent calculation:`, {
          sfdc_account_id: sfdcAccountId,
          ultimate_parent_id: ultimateParentId,
          is_self_referencing: isSelfReferencing,
          is_parent: mappedRow['is_parent']
        });
      }
      
    } else if (fileType === 'opportunities') {
      // Essential fields
      const essentialFields = ['sfdc_opportunity_id', 'sfdc_account_id'];
      const missingEssential = essentialFields.filter(field => {
        const value = mappedRow[field];
        return !value || value === null || value === '' || value === 'undefined';
      });
      
      if (missingEssential.length > 0) {
        criticalErrors.push(`Row ${rowNum}: Missing essential fields: ${missingEssential.join(', ')}`);
        hasCriticalErrors = true;
      }

      // High priority fields - generate warnings but don't block import
      // Many of these fields may be empty for certain opportunity types
      const highPriorityFields = [
        'opportunity_name', 'opportunity_type'
      ];
      const missingHighPriority = highPriorityFields.filter(field => {
        const value = mappedRow[field];
        return !value || value === null || value === '' || value === 'undefined';
      });

      if (missingHighPriority.length > 0) {
        // Generate warning instead of critical error
        warnings.push(`Row ${rowNum}: Missing high-priority fields: ${missingHighPriority.join(', ')}`);
        // DON'T block import - allow it to proceed
      }
      
      // Generate warnings for potentially problematic values
      if (!mappedRow['stage'] || mappedRow['stage'] === null) {
        warnings.push(`Row ${rowNum}: Missing stage`);
        // No default - keep it blank/null
      }
      
      
      // Add debug logging for opportunity mapping
      if (rowNum <= 3) {
        console.log(`Debug Row ${rowNum} mapped data:`, {
          owner_id: mappedRow['owner_id'],
          owner_name: mappedRow['owner_name'], 
          amount: mappedRow['amount'],
          stage: mappedRow['stage']
        });
      }
      
    } else if (fileType === 'sales_reps') {
      // Essential fields
      const essentialFields = ['rep_id', 'name'];
      const missingEssential = essentialFields.filter(field => {
        const value = mappedRow[field];
        const isEmpty = !value || value === null || value === '' || value === 'undefined' || 
                       (typeof value === 'string' && value.trim() === '');
        
        // Enhanced debug logging for sales rep validation
        if (index < 5) {
          console.log(`🔍 Sales rep field validation - Row ${rowNum}, Field: ${field}:`, {
            value,
            isEmpty,
            valueType: typeof value,
            mappedRowKeys: Object.keys(mappedRow)
          });
        }
        
        return isEmpty;
      });
      
      if (missingEssential.length > 0) {
        const errorMsg = `Row ${rowNum}: Missing essential fields: ${missingEssential.join(', ')}`;
        criticalErrors.push(errorMsg);
        console.error('❌ Essential fields missing:', {
          rowNum,
          missingFields: missingEssential,
          mappedRow,
          rawRow: row
        });
        hasCriticalErrors = true;
      }

      // High priority fields - generate warnings but don't block import
      // Some reps may not have all hierarchy info filled in yet
      const highPriorityFields = ['team', 'manager', 'region'];
      const missingHighPriority = highPriorityFields.filter(field => {
        const value = mappedRow[field];
        return !value || value === null || value === '' || value === 'undefined' || 
               (typeof value === 'string' && value.trim() === '');
      });

      if (missingHighPriority.length > 0) {
        // Generate warning instead of critical error
        warnings.push(`Row ${rowNum}: Missing high-priority fields: ${missingHighPriority.join(', ')}`);
        // DON'T block import
      }
      
      if (index < 3) {
        console.log(`✅ Sales rep row ${rowNum} passed validation:`, mappedRow);
      }
    }
    
    // Only exclude rows with critical errors
    if (!hasCriticalErrors) {
      validData.push(mappedRow);
    }
   });
   
   // Debug summary for ultimate_parent_id
   const ultimateParentIdCount = validData.filter(row => row.ultimate_parent_id && row.ultimate_parent_id !== '').length;
   console.log('🏁 Validation Summary:', {
     totalRows: data.length,
     validRows: validData.length,
     recordsWithUltimateParentId: ultimateParentIdCount,
     sampleUltimateParentIds: validData
       .filter(row => row.ultimate_parent_id && row.ultimate_parent_id !== '')
       .slice(0, 3)
       .map(row => ({ sfdc_account_id: row.sfdc_account_id, ultimate_parent_id: row.ultimate_parent_id }))
   });
   
   return { 
     validData, 
     errors, 
     warnings,
     criticalErrors,
     totalRows: data.length,
     validRows: validData.length
   };
};

// Validate account data - simplified and more permissive (works with transformed data)
export const validateAccountData = (accounts: any[]): string[] => {
  const warnings: string[] = [];
  const accountIds = new Set<string>();
  
  accounts.forEach((account, index) => {
    const rowNum = index + 1;
    
    // Check for duplicate Account IDs (warning only, not blocking)
    const accountId = account.sfdc_account_id;
    if (accountId && accountIds.has(accountId)) {
      warnings.push(`Row ${rowNum}: Duplicate Account ID: ${accountId} - will handle gracefully during import`);
    } else if (accountId) {
      accountIds.add(accountId);
    }
    
    // Validate employee count (warning only)
    if (account.employees && account.employees < 0) {
      warnings.push(`Row ${rowNum}: Invalid employee count: ${account.employees} - will be set to null`);
    }
    
    // Validate ARR (warning only)
    if (account.arr && account.arr < 0) {
      warnings.push(`Row ${rowNum}: Invalid ARR: ${account.arr} - will be set to null`);
    }
    
    // No strict validation on territories, GEO, industry, etc. - accept any values
  });
  
  return warnings;
};

export const validateOpportunityData = (opportunities: any[]): string[] => {
  const warnings: string[] = [];
  const opportunityIds = new Set<string>();
  
  opportunities.forEach((opp, index) => {
    const rowNum = index + 1;
    
    // Check for duplicate Opportunity IDs (warning only)
    const oppId = opp.sfdc_opportunity_id;
    if (oppId && opportunityIds.has(oppId)) {
      warnings.push(`Row ${rowNum}: Duplicate Opportunity ID: ${oppId} - will handle gracefully during import`);
    } else if (oppId) {
      opportunityIds.add(oppId);
    }
    
    // Validate dates (warning only)
    try {
      if (opp.close_date && new Date(opp.close_date).toString() === 'Invalid Date') {
        warnings.push(`Row ${rowNum}: Invalid close date: ${opp.close_date}`);
      }
      if (opp.created_date && new Date(opp.created_date).toString() === 'Invalid Date') {
        warnings.push(`Row ${rowNum}: Invalid created date: ${opp.created_date}`);
      }
    } catch (error) {
      warnings.push(`Row ${rowNum}: Date validation error`);
    }
    
    // Accept any stage value - no validation needed
  });
  
  return warnings;
};

// Generate sample CSV content for testing
// Headers match the field aliases in autoMappingUtils.ts for reliable auto-mapping
export const generateSampleAccountsCSV = (): string => {
  const headers = [
    'Account ID (18)', 'Account Name', 'Ultimate Parent Id', 'Ultimate Parent Name', 
    'Owner Full Name', 'Owner ID', 'Billing Country (HQ Country)', 
    'Sales Territory', 'GEO', 'Employee Count (Account)', 'Employee Count (Ultimate Parent)', 
    'Is Customer (Y/N)', 'ARR (current)', 'Expansion Tier', 'Initial Sale Tier', 'Type', 'Industry', 'Is Strategic'
  ];
  const sampleData = [
    ['ACC001', 'Global Enterprise Corp', 'ACC001', 'Global Enterprise Corp', 'John Smith', 'USR001', 'United States', 'Enterprise AMER', 'AMER', '5000', '5000', 'true', '850000', 'Tier1', 'Enterprise', 'Customer', 'Technology', 'true'],
    ['ACC002', 'Tech Solutions Ltd', 'ACC001', 'Global Enterprise Corp', 'Sarah Johnson', 'USR002', 'United Kingdom', 'UKI', 'EMEA', '1200', '5000', 'true', '420000', 'Tier2', 'Commercial', 'Customer', 'Software', 'true'],
    ['ACC003', 'Startup Innovations', 'ACC003', 'Startup Innovations', 'Mike Wilson', 'USR003', 'Canada', 'DAC', 'AMER', '150', '150', 'false', '65000', 'Tier3', 'Commercial', 'Prospect', 'SaaS', 'false'],
    ['ACC004', 'Manufacturing Co', 'ACC004', 'Manufacturing Co', 'Emma Davis', 'USR004', 'Germany', 'France', 'EMEA', '800', '800', 'true', '180000', 'Tier2', 'Commercial', 'Customer', 'Manufacturing', 'false'],
    ['ACC005', 'Regional Branch', 'ACC001', 'Global Enterprise Corp', 'Sarah Johnson', 'USR002', 'France', 'France', 'EMEA', '300', '5000', 'true', '125000', 'Tier1', 'Enterprise', 'Customer', 'Technology', 'false']
  ];
  
  return [headers.join(','), ...sampleData.map(row => row.join(','))].join('\n');
};

export const generateSampleOpportunitiesCSV = (): string => {
  const headers = ['OpportunityId', 'Opportunity Name', 'Opportunity Type', 'AccountId', 'Stage', 'CloseDate', 'CreatedDate', 'OwnerId', 'Owner Name', 'Available To Renew', 'CRE Status', 'Renewal Event Date', 'Net ARR'];
  const sampleData = [
    ['OPP001', 'Q1 Enterprise Expansion', 'Expansion', 'ACC001', 'Negotiation', '2024-03-15', '2023-12-01', 'USR001', 'John Smith', '150000', 'Green', '2024-12-31', '200000'],
    ['OPP002', 'New Customer Acquisition', 'New Business', 'ACC002', 'Proposal', '2024-04-30', '2024-01-15', 'USR002', 'Sarah Johnson', '0', 'Yellow', '2024-06-30', '150000'],
    ['OPP003', 'SMB Growth Deal', 'Expansion', 'ACC003', 'Discovery', '2024-06-15', '2024-02-01', 'USR003', 'Mike Wilson', '25000', 'Green', '', '40000'],
    ['OPP004', 'Renewal Plus Expansion', 'Renewal', 'ACC004', 'Closed Won', '2024-02-28', '2023-11-01', 'USR004', 'Emma Davis', '75000', 'Red', '2024-08-15', '80000'],
    ['OPP005', 'Strategic Partnership', 'New Business', 'ACC001', 'Prospecting', '2024-07-30', '2024-01-10', 'USR001', 'John Smith', '0', 'Green', '2025-01-31', '320000']
  ];
  
  return [headers.join(','), ...sampleData.map(row => row.join(','))].join('\n');
};

export const generateSampleSalesRepsCSV = (): string => {
  const headers = ['RepId', 'Name', 'Manager', 'Team', 'Region', 'FLM', 'SLM', 'Is Strategic'];
  const sampleData = [
    ['REP001', 'John Smith', 'Alice Manager', 'Enterprise Sales', 'AMER', 'Alice Manager', 'VP Sales AMER', 'true'],
    ['REP002', 'Sarah Johnson', 'Bob Director', 'Commercial Sales', 'EMEA', 'Bob Director', 'VP Sales EMEA', 'true'],
    ['REP003', 'Mike Wilson', 'Alice Manager', 'Enterprise Sales', 'AMER', 'Alice Manager', 'VP Sales AMER', 'false'],
    ['REP004', 'Emma Davis', 'Carol Lead', 'SMB Sales', 'EMEA', 'Carol Lead', 'Director SMB', 'false'],
    ['REP005', 'David Chen', 'Dan Manager', 'Commercial Sales', 'APAC', 'Dan Manager', 'VP Sales APAC', 'false']
  ];
  
  return [headers.join(','), ...sampleData.map(row => row.join(','))].join('\n');
};

// Transform already-mapped account data to database format - ALL fields
export const transformAccountData = (mappedData: any[], buildId: string) => {
  console.log('🔄 transformAccountData called with:', { 
    mappedDataType: typeof mappedData, 
    isArray: Array.isArray(mappedData), 
    length: mappedData?.length, 
    buildId 
  });
  
  if (!mappedData || !Array.isArray(mappedData)) {
    console.error('❌ transformAccountData: mappedData is not a valid array:', mappedData);
    throw new Error('Invalid data provided to transformAccountData - expected array but got ' + typeof mappedData);
  }
  
  if (mappedData.length === 0) {
    console.warn('⚠️ transformAccountData: empty data array provided');
    return [];
  }
  
  return mappedData.map(row => {
    // Helper function to safely convert to number
    const toNumber = (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    };
    
    // Helper function to safely convert to boolean
    const toBoolean = (value: any) => {
      if (value === null || value === undefined || value === '') return false;
      if (typeof value === 'boolean') return value;
      const str = value.toString().toLowerCase();
      return ['true', 'yes', 'y', '1'].includes(str);
    };
    
    // Helper function to sanitize ID fields - converts empty strings to null
    const sanitizeIdField = (value: any): string | null => {
      if (!value || value.toString().trim() === '' || value === 'null' || value === 'undefined') {
        return null;
      }
      const trimmed = value.toString().trim();
      // Validate Salesforce ID format (15 or 18 characters)
      if (trimmed.length === 15 || trimmed.length === 18) {
        return trimmed;
      }
      // If it's not a valid Salesforce ID format but has content, keep it
      return trimmed.length > 0 ? trimmed : null;
    };
    
    // Helper function to safely convert to date string without timezone shifts
    const toDateString = (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      try {
        const str = value.toString().trim();
        // Handle YYYY-MM-DD format directly
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          return str;
        }
        // Parse date manually to avoid timezone conversions
        const date = new Date(str);
        if (isNaN(date.getTime())) return null;
        // Get local date components and format as YYYY-MM-DD
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch {
        return null;
      }
    };
    
     // Debug ultimate_parent_id in transformation
     if (row.ultimate_parent_id) {
       console.log('📝 Account transformation - ultimate_parent_id found:', {
         sfdc_account_id: row.sfdc_account_id,
         ultimate_parent_id: row.ultimate_parent_id,
         ultimate_parent_name: row.ultimate_parent_name
       });
     }

      return {
        sfdc_account_id: row.sfdc_account_id || null,
        account_name: row.account_name || null,
        ultimate_parent_id: sanitizeIdField(row.ultimate_parent_id),
        ultimate_parent_name: row.ultimate_parent_name || null,
        parent_id: sanitizeIdField(row.parent_id),
       owner_name: row.owner_name || null,
       owner_id: row.owner_id || null,
       hq_country: row.hq_country || null,
       sales_territory: row.sales_territory || null,
       geo: row.geo || (row.sales_territory ? autoMapTerritoryToRegion(row.sales_territory) : null),
      employees: toNumber(row.employees),
      ultimate_parent_employee_size: toNumber(row.ultimate_parent_employee_size),
      is_customer: toBoolean(row.is_customer),
      arr: toNumber(row.arr),
      atr: toNumber(row.atr),
      renewal_date: toDateString(row.renewal_date),
      owner_change_date: toDateString(row.owner_change_date) || toDateString(row.edit_date) || null,
      expansion_tier: row.expansion_tier || null,
      account_type: row.account_type || null,
      enterprise_vs_commercial: row.enterprise_vs_commercial || null,
      industry: row.industry || null,
      initial_sale_tier: row.initial_sale_tier || null,
      expansion_score: toNumber(row.expansion_score),
      initial_sale_score: toNumber(row.initial_sale_score),
      has_customer_hierarchy: toBoolean(row.has_customer_hierarchy),
      in_customer_hierarchy: toBoolean(row.in_customer_hierarchy),
      include_in_emea: toBoolean(row.include_in_emea),
       // Calculate is_parent based on ultimate_parent_id (accounting for self-referencing pattern)
       // Parent accounts are: (1) ultimate_parent_id is NULL/empty OR (2) Self-referencing (sfdc_account_id = ultimate_parent_id)
       is_parent: (() => {
         const ultimateParentId = sanitizeIdField(row.ultimate_parent_id);
         const sfdcAccountId = row.sfdc_account_id;
         const isNullOrEmpty = !ultimateParentId;
         const isSelfReferencing = ultimateParentId && sfdcAccountId && ultimateParentId === sfdcAccountId;
         return isNullOrEmpty || isSelfReferencing;
       })(),
      is_2_0: toBoolean(row.is_2_0),
      owners_lifetime_count: toNumber(row.owners_lifetime_count),
      inbound_count: toNumber(row.inbound_count),
      idr_count: toNumber(row.idr_count),
      risk_flag: toBoolean(row.risk_flag),
      cre_risk: toBoolean(row.cre_risk),
      hierarchy_bookings_arr_converted: toNumber(row.hierarchy_bookings_arr_converted),
      // Optional stability fields - no error if missing
      pe_firm: row.pe_firm || null,
      // Strategic flag for Priority 0 optimization
      is_strategic: toBoolean(row.is_strategic),
      build_id: buildId
    };
  });
};

// Transform already-mapped opportunity data to database format
export const transformOpportunityData = (mappedData: any[], buildId: string) => {
  console.log('🔄 transformOpportunityData called with:', { 
    mappedDataType: typeof mappedData, 
    isArray: Array.isArray(mappedData), 
    length: mappedData?.length, 
    buildId 
  });
  
  if (!mappedData || !Array.isArray(mappedData)) {
    console.error('❌ transformOpportunityData: mappedData is not a valid array:', mappedData);
    throw new Error('Invalid data provided to transformOpportunityData - expected array but got ' + typeof mappedData);
  }
  
  if (mappedData.length === 0) {
    console.warn('⚠️ transformOpportunityData: empty data array provided');
    return [];
  }
  
  return mappedData.map(row => {
    console.log('Transform opportunity row:', row); // Debug logging
    
    // Helper function to safely convert to date string without timezone shifts
    const toDateString = (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      try {
        const str = value.toString().trim();
        // Handle YYYY-MM-DD format directly
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          return str;
        }
        // Parse date manually to avoid timezone conversions
        const date = new Date(str);
        if (isNaN(date.getTime())) return null;
        // Get local date components and format as YYYY-MM-DD
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch {
        return null;
      }
    };
    
    // Helper function to safely convert to number
    const toNumber = (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    };
    
    // The data is already transformed through field mapping, so use it directly
    return {
      sfdc_opportunity_id: row.sfdc_opportunity_id,
      sfdc_account_id: row.sfdc_account_id,
      opportunity_name: row.opportunity_name || null,
      opportunity_type: row.opportunity_type || null,
      stage: row.stage || null,
      available_to_renew: toNumber(row.available_to_renew),
      close_date: toDateString(row.close_date),
      created_date: toDateString(row.created_date),
      owner_id: row.owner_id || null,
      owner_name: row.owner_name || null,
      cre_status: row.cre_status || null,
      renewal_event_date: toDateString(row.renewal_event_date),
      net_arr: toNumber(row.net_arr),
      build_id: buildId
    };
  });
};

// Transform already-mapped sales rep data to database format
export const transformSalesRepData = (mappedData: any[], buildId: string) => {
  console.log('🔄 transformSalesRepData called with:', { 
    mappedDataType: typeof mappedData, 
    isArray: Array.isArray(mappedData), 
    length: mappedData?.length, 
    buildId 
  });
  
  if (!mappedData || !Array.isArray(mappedData)) {
    console.error('❌ transformSalesRepData: mappedData is not a valid array:', mappedData);
    throw new Error('Invalid data provided to transformSalesRepData - expected array but got ' + typeof mappedData);
  }
  
  if (mappedData.length === 0) {
    console.warn('⚠️ transformSalesRepData: empty data array provided');
    return [];
  }
  
  // Helper function to safely convert to boolean
  const toBoolean = (value: any) => {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'boolean') return value;
    const str = value.toString().toLowerCase();
    return ['true', 'yes', 'y', '1'].includes(str);
  };

  return mappedData.map(row => {
    console.log('Transform sales rep row:', row); // Debug logging
    // The data is already transformed through field mapping, so use it directly
    return {
      rep_id: row.rep_id,
      name: row.name,
      manager: row.manager || null,
      team: row.team || null,
      region: row.region || null,
      flm: row.flm || null,
      slm: row.slm || null,
      // Strategic rep flag - can be imported or set manually in UI
      is_strategic_rep: toBoolean(row.is_strategic_rep || row.is_strategic),
      build_id: buildId
    };
  });
};

// Enhanced import functions with batch processing and performance optimization

// Determine optimal import strategy based on data size
export const getOptimalImportStrategy = (dataSize: number, fileSize?: number) => {
  const BATCH_THRESHOLD = 100; // Lower threshold - use batch processing for 100+ records to avoid timeouts
  const STREAMING_THRESHOLD = 10 * 1024 * 1024; // 10MB
  
  return {
    useBatchImport: dataSize > BATCH_THRESHOLD,
    useServerSideImport: (fileSize || 0) > 50 * 1024 * 1024, // 50MB
    useStreamingParser: (fileSize || 0) > STREAMING_THRESHOLD,
    // Aggressive batch sizes for speed - Supabase handles large batches well with pure INSERTs
    recommendedBatchSize: dataSize < 1000 ? 500 : dataSize < 10000 ? 2000 : 5000
  };
};

// Import accounts to database with optimized batch processing
export const importAccountsToDatabase = async (
  csvData: any[],
  buildId: string,
  onProgress?: (processed: number, total: number) => void
): Promise<ImportResult> => {
  console.log('🚀 importAccountsToDatabase started with:', { 
    dataType: typeof csvData, 
    isArray: Array.isArray(csvData), 
    length: csvData?.length, 
    buildId 
  });
  
  if (!csvData || !Array.isArray(csvData)) {
    const errorMsg = `Invalid data provided to importAccountsToDatabase - expected array but got ${typeof csvData}`;
    console.error('❌', errorMsg);
    return {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: [errorMsg]
    };
  }
  
  if (csvData.length === 0) {
    console.warn('⚠️ importAccountsToDatabase: no data to import');
    return {
      success: true,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: []
    };
  }

  const transformedData = transformAccountData(csvData, buildId);
  const strategy = getOptimalImportStrategy(transformedData.length);

  // STEP 1: Delete existing accounts for this build
  console.log(`🗑️ Deleting existing accounts for build ${buildId}...`);
  const { error: deleteError } = await supabase
    .from('accounts')
    .delete()
    .eq('build_id', buildId);
  
  if (deleteError) {
    console.error('❌ Failed to delete existing accounts:', deleteError);
    return {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: [`Failed to clear existing accounts: ${deleteError.message}`]
    };
  }
  
  console.log(`✅ Cleared existing accounts. Now importing fresh data...`);

  // Use batch processing for large datasets
  if (strategy.useBatchImport) {
    console.log(`📦 Using batch import strategy for ${transformedData.length} records (pure INSERT)`);
    
    const batchResult = await BatchImportService.importAccountsBatch(
      transformedData,
      buildId,
      (progress) => {
        if (onProgress) {
          onProgress(progress.processed, progress.total);
        }
      },
      { 
        batchSize: strategy.recommendedBatchSize,
        maxConcurrentBatches: 5 // More parallel batches for speed
      }
    );

    return {
      success: batchResult.success,
      recordsProcessed: batchResult.recordsProcessed,
      recordsImported: batchResult.recordsImported,
      errors: batchResult.errors
    };
  }

  // Fallback to individual processing for smaller datasets
  console.log(`📄 Using individual record processing for ${transformedData.length} records`);
  
  const total = transformedData.length;
  let imported = 0;
  const errors: string[] = [];

  try {
    console.log(`Starting import of ${total} accounts for build ${buildId}`);
    
    // Process records individually for small datasets
    for (let i = 0; i < transformedData.length; i++) {
      const record = transformedData[i];
      
      try {
        const { error, data } = await supabase
          .from('accounts')
          .insert(record)
          .select('id');

        if (error) {
          console.error(`Record ${i + 1} error:`, error);
          errors.push(`Record ${i + 1} (Account ID: ${record.sfdc_account_id}): ${error.message}`);
        } else {
          imported++;
        }
      } catch (recordError) {
        const errorMsg = recordError instanceof Error ? recordError.message : 'Unknown error';
        errors.push(`Record ${i + 1} (Account ID: ${record.sfdc_account_id}): ${errorMsg}`);
      }

      // Update progress less frequently for better performance
      if (onProgress && (i + 1) % Math.max(50, Math.floor(total / 100)) === 0) {
        onProgress(i + 1, total);
      }
    }

    // Final progress update
    if (onProgress) {
      onProgress(total, total);
    }

    console.log(`Import completed. Successfully imported: ${imported}/${total}`);
    
    return {
      success: imported > 0,
      recordsProcessed: total,
      recordsImported: imported,
      errors
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Import error:', message);
    return {
      success: false,
      recordsProcessed: total,
      recordsImported: imported,
      errors: [...errors, `Import failed: ${message}`]
    };
  }
};

// Import opportunities to database with optimized batch processing
export const importOpportunitiesToDatabase = async (
  csvData: any[],
  buildId: string,
  onProgress?: (processed: number, total: number) => void
): Promise<ImportResult> => {
  console.log('🚀 importOpportunitiesToDatabase started with:', { 
    dataType: typeof csvData, 
    isArray: Array.isArray(csvData), 
    length: csvData?.length, 
    buildId 
  });
  
  if (!csvData || !Array.isArray(csvData)) {
    const errorMsg = `Invalid data provided to importOpportunitiesToDatabase - expected array but got ${typeof csvData}`;
    console.error('❌', errorMsg);
    return {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: [errorMsg]
    };
  }
  
  if (csvData.length === 0) {
    console.warn('⚠️ importOpportunitiesToDatabase: no data to import');
    return {
      success: true,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: []
    };
  }

  const transformedData = transformOpportunityData(csvData, buildId);
  const strategy = getOptimalImportStrategy(transformedData.length);

  // Use OPTIMIZED batch processing for large datasets
  if (strategy.useBatchImport) {
    console.log(`📦 Using OPTIMIZED batch import strategy for ${transformedData.length} opportunities`);
    console.log(`⚡ Trigger removed - account metrics will be calculated once at the end for speed`);
    
    // STEP 1: Check account references and flag orphaned opportunities
    console.log('🔍 Checking account references...');
    const uniqueAccountIds = [...new Set(transformedData.map(opp => opp.sfdc_account_id))];
    const { data: existingAccounts, error: accountCheckError } = await supabase
      .from('accounts')
      .select('sfdc_account_id')
      .eq('build_id', buildId)
      .in('sfdc_account_id', uniqueAccountIds);

    if (accountCheckError) {
      console.error('❌ Failed to check account references:', accountCheckError);
      return {
        success: false,
        recordsProcessed: 0,
        recordsImported: 0,
        errors: [`Failed to check account references: ${accountCheckError.message}`]
      };
    }

    const existingAccountIds = new Set(existingAccounts?.map(a => a.sfdc_account_id) || []);
    
    // Flag opportunities as orphaned if their account doesn't exist
    const dataWithOrphanFlags = transformedData.map(opp => ({
      ...opp,
      is_orphaned: !existingAccountIds.has(opp.sfdc_account_id)
    }));
    
    const orphanedCount = dataWithOrphanFlags.filter(o => o.is_orphaned).length;
    if (orphanedCount > 0) {
      console.log(`⚠️ Found ${orphanedCount} orphaned opportunities (will import with is_orphaned=true)`);
    }
    
    console.log(`✅ Importing all ${transformedData.length} opportunities (${orphanedCount} orphaned)`);
    
    console.log(`🗑️ Deleting existing opportunities for build ${buildId} to avoid conflict check timeouts...`);
    const { error: deleteError } = await supabase
      .from('opportunities')
      .delete()
      .eq('build_id', buildId);
    
    if (deleteError) {
      console.error('❌ Failed to delete existing opportunities:', deleteError);
      return {
        success: false,
        recordsProcessed: 0,
        recordsImported: 0,
        errors: [`Failed to clear existing opportunities: ${deleteError.message}`]
      };
    }
    
    console.log(`✅ Cleared existing opportunities. Now importing fresh data...`);
    
    // STEP 3: Import opportunities in batches (no trigger to slow us down)
    console.log('🚀 Importing opportunities in batches (fast!)');
    const batchResult = await BatchImportService.importOpportunitiesOptimized(
      dataWithOrphanFlags,
      buildId,
      (progress) => {
        if (onProgress) {
          onProgress(progress.processed, progress.total);
        }
      },
      { batchSize: 500, maxConcurrentBatches: 4 } // Aggressive batching for speed
    );

    // STEP 4: Calculate account metrics once for the entire build (much faster than per-opportunity)
    console.log('🔄 Calculating account metrics for all imported opportunities...');
    if (batchResult.success && batchResult.recordsImported > 0) {
      try {
        const { error: calcError } = await supabase.rpc('update_account_calculated_values', { 
          p_build_id: buildId 
        });
        
        if (calcError) {
          console.error('⚠️ Account calculations failed:', calcError);
        } else {
          console.log('✅ Account metrics calculated successfully');
        }
      } catch (err) {
        console.error('⚠️ Exception calculating account metrics:', err);
      }
    }
    if (batchResult.success && batchResult.recordsImported > 0) {
      console.log('🔄 Running account calculations once for entire build...');
      const { error: calcError } = await supabase.rpc('update_account_calculated_values', {
        p_build_id: buildId
      });
      
      if (calcError) {
        console.warn('⚠️ Failed to recalculate account values:', calcError.message);
      } else {
        console.log('✅ Account calculations completed');
      }
      
      // Sync renewal_quarter from opportunity renewal_event_date
      try {
        await BatchImportService.syncRenewalQuarterFromOpportunities(buildId);
      } catch (syncError) {
        console.warn('⚠️ renewal_quarter sync failed (non-fatal):', syncError);
      }
    }

    return {
      success: batchResult.success,
      recordsProcessed: batchResult.recordsProcessed,
      recordsImported: batchResult.recordsImported,
      errors: batchResult.errors
    };
  }

  // Fallback to individual processing for smaller datasets
  // First delete existing opportunities for this build
  console.log(`🗑️ Deleting existing opportunities for build ${buildId}...`);
  const { error: deleteError } = await supabase
    .from('opportunities')
    .delete()
    .eq('build_id', buildId);
  
  if (deleteError) {
    console.error('❌ Failed to delete existing opportunities:', deleteError);
    return {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: [`Failed to clear existing opportunities: ${deleteError.message}`]
    };
  }
  
  // Check account references and flag orphaned
  const uniqueAccountIds = [...new Set(transformedData.map(opp => opp.sfdc_account_id))];
  const { data: existingAccounts } = await supabase
    .from('accounts')
    .select('sfdc_account_id')
    .eq('build_id', buildId)
    .in('sfdc_account_id', uniqueAccountIds);

  const existingAccountIds = new Set(existingAccounts?.map(a => a.sfdc_account_id) || []);
  const dataWithOrphanFlags = transformedData.map(opp => ({
    ...opp,
    is_orphaned: !existingAccountIds.has(opp.sfdc_account_id)
  }));
  
  const orphanedCount = dataWithOrphanFlags.filter(o => o.is_orphaned).length;
  if (orphanedCount > 0) {
    console.log(`⚠️ Found ${orphanedCount} orphaned opportunities`);
  }
  
  const total = dataWithOrphanFlags.length;
  let imported = 0;
  const errors: string[] = [];

  try {
    console.log(`Starting import of ${total} opportunities for build ${buildId} (pure INSERT)`);
    
    for (let i = 0; i < dataWithOrphanFlags.length; i++) {
      const record = dataWithOrphanFlags[i];
      
      try {
        const { error, data } = await supabase
          .from('opportunities')
          .insert(record)
          .select('id');

        if (error) {
          console.error(`Record ${i + 1} error:`, error);
          errors.push(`Record ${i + 1} (Opportunity ID: ${record.sfdc_opportunity_id}): ${error.message}`);
        } else {
          imported++;
        }
      } catch (recordError) {
        const errorMsg = recordError instanceof Error ? recordError.message : 'Unknown error';
        errors.push(`Record ${i + 1} (Opportunity ID: ${record.sfdc_opportunity_id}): ${errorMsg}`);
      }

      if (onProgress && (i + 1) % Math.max(50, Math.floor(total / 100)) === 0) {
        onProgress(i + 1, total);
      }
    }

    if (onProgress) {
      onProgress(total, total);
    }

    console.log(`Import completed. Successfully imported: ${imported}/${total}`);
    
    // Sync renewal_quarter from opportunity renewal_event_date
    if (imported > 0) {
      try {
        await BatchImportService.syncRenewalQuarterFromOpportunities(buildId);
      } catch (syncError) {
        console.warn('⚠️ renewal_quarter sync failed (non-fatal):', syncError);
      }
    }
    
    return {
      success: imported > 0,
      recordsProcessed: total,
      recordsImported: imported,
      errors
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Import error:', message);
    return {
      success: false,
      recordsProcessed: total,
      recordsImported: imported,
      errors: [...errors, `Import failed: ${message}`]
    };
  }
};

// Import sales reps to database with optimized batch processing
export const importSalesRepsToDatabase = async (
  csvData: any[],
  buildId: string,
  onProgress?: (processed: number, total: number) => void
): Promise<ImportResult> => {
  console.log('🚀 importSalesRepsToDatabase started with:', { 
    dataType: typeof csvData, 
    isArray: Array.isArray(csvData), 
    length: csvData?.length, 
    buildId 
  });
  
  if (!csvData || !Array.isArray(csvData)) {
    const errorMsg = `Invalid data provided to importSalesRepsToDatabase - expected array but got ${typeof csvData}`;
    console.error('❌', errorMsg);
    return {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: [errorMsg]
    };
  }
  
  if (csvData.length === 0) {
    console.warn('⚠️ importSalesRepsToDatabase: no data to import');
    return {
      success: true,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: []
    };
  }

  const transformedData = transformSalesRepData(csvData, buildId);
  const strategy = getOptimalImportStrategy(transformedData.length);

  // STEP 1: Delete existing sales reps for this build
  console.log(`🗑️ Deleting existing sales reps for build ${buildId}...`);
  const { error: deleteError } = await supabase
    .from('sales_reps')
    .delete()
    .eq('build_id', buildId);
  
  if (deleteError) {
    console.error('❌ Failed to delete existing sales reps:', deleteError);
    return {
      success: false,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: [`Failed to clear existing sales reps: ${deleteError.message}`]
    };
  }
  
  console.log(`✅ Cleared existing sales reps. Now importing fresh data...`);

  // Use batch processing for large datasets
  if (strategy.useBatchImport) {
    console.log(`📦 Using batch import strategy for ${transformedData.length} sales reps (pure INSERT)`);
    
    const batchResult = await BatchImportService.importSalesRepsBatch(
      transformedData,
      buildId,
      (progress) => {
        if (onProgress) {
          onProgress(progress.processed, progress.total);
        }
      },
      { 
        batchSize: strategy.recommendedBatchSize,
        maxConcurrentBatches: 5 // More parallel batches for speed
      }
    );

    return {
      success: batchResult.success,
      recordsProcessed: batchResult.recordsProcessed,
      recordsImported: batchResult.recordsImported,
      errors: batchResult.errors
    };
  }

  // Fallback to individual processing for smaller datasets
  const total = transformedData.length;
  let imported = 0;
  const errors: string[] = [];

  try {
    console.log(`Starting import of ${total} sales reps for build ${buildId}`);
    
    for (let i = 0; i < transformedData.length; i++) {
      const record = transformedData[i];
      
      try {
        const { error, data } = await supabase
          .from('sales_reps')
          .insert(record)
          .select('id');

        if (error) {
          console.error(`Record ${i + 1} error:`, error);
          errors.push(`Record ${i + 1} (Rep ID: ${record.rep_id}): ${error.message}`);
        } else {
          imported++;
        }
      } catch (recordError) {
        const errorMsg = recordError instanceof Error ? recordError.message : 'Unknown error';
        errors.push(`Record ${i + 1} (Rep ID: ${record.rep_id}): ${errorMsg}`);
      }

      if (onProgress && (i + 1) % Math.max(50, Math.floor(total / 100)) === 0) {
        onProgress(i + 1, total);
      }
    }

    if (onProgress) {
      onProgress(total, total);
    }

    console.log(`Import completed. Successfully imported: ${imported}/${total}`);
    
    return {
      success: imported > 0,
      recordsProcessed: total,
      recordsImported: imported,
      errors
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Import error:', message);
    return {
      success: false,
      recordsProcessed: total,
      recordsImported: imported,
      errors: [...errors, `Import failed: ${message}`]
    };
  }
};

// Utility to convert array data to CSV
export const arrayToCSV = (data: any[]): string => {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');
  
  return csvContent;
};