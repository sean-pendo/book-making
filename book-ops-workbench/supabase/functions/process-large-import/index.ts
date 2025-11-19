import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImportRequest {
  fileData: string; // Base64 encoded CSV data
  fileType: 'accounts' | 'opportunities' | 'sales_reps';
  buildId: string;
  fieldMappings: { [csvField: string]: string };
  batchSize?: number;
}

interface ImportProgress {
  processed: number;
  total: number;
  imported: number;
  failed: number;
  errors: string[];
  progress: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Large import processing started');
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { fileData, fileType, buildId, fieldMappings, batchSize = 1000 }: ImportRequest = await req.json();

    if (!fileData || !fileType || !buildId) {
      throw new Error('Missing required parameters: fileData, fileType, buildId');
    }

    console.log(`📊 Processing ${fileType} import for build ${buildId}`);

    // Decode base64 CSV data
    const csvText = atob(fileData);
    console.log(`📄 CSV data decoded: ${csvText.length} characters`);

    // Simple CSV parsing (can be enhanced)
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    console.log(`📋 Headers found: ${headers.length} columns`);

    // Transform data based on field mappings
    const transformedData = [];
    const errors: string[] = [];
    
    // Helper function to sanitize ID fields
    const sanitizeIdField = (value: string): string | null => {
      if (!value || value.trim() === '' || value.toLowerCase() === 'null' || value.toLowerCase() === 'undefined') {
        return null;
      }
      const trimmed = value.trim();
      // Validate Salesforce ID format (15 or 18 characters)
      if (trimmed.length === 15 || trimmed.length === 18) {
        return trimmed;
      }
      // If it's not a valid Salesforce ID format, treat as null
      return null;
    };

    // Helper function to sanitize general fields
    const sanitizeField = (value: string): string | null => {
      if (!value || value.trim() === '' || value.toLowerCase() === 'null' || value.toLowerCase() === 'undefined') {
        return null;
      }
      return value.trim();
    };
    
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const record: any = { build_id: buildId };
        
        // Apply field mappings with proper sanitization
        headers.forEach((header, index) => {
          const schemaField = fieldMappings[header];
          if (schemaField && values[index] !== undefined) {
            const rawValue = values[index];
            
            // Special handling for ID fields
            if (schemaField.includes('_id') || schemaField === 'parent_id' || schemaField === 'ultimate_parent_id') {
              record[schemaField] = sanitizeIdField(rawValue);
            } else {
              record[schemaField] = sanitizeField(rawValue);
            }
          }
        });

        // Add type-specific transformations
        if (fileType === 'accounts') {
          // Ensure required fields for accounts
          if (!record.sfdc_account_id || !record.account_name) {
            errors.push(`Row ${i + 1}: Missing required fields (sfdc_account_id, account_name)`);
            continue;
          }
          
          // Calculate is_parent based on ultimate_parent_id instead of CSV value
          const ultimateParentId = record.ultimate_parent_id;
          record.is_parent = !ultimateParentId || ultimateParentId.trim() === '' || ultimateParentId.toLowerCase() === 'null';
          
        } else if (fileType === 'opportunities') {
          // Ensure required fields for opportunities
          if (!record.sfdc_opportunity_id || !record.sfdc_account_id) {
            errors.push(`Row ${i + 1}: Missing required fields (sfdc_opportunity_id, sfdc_account_id)`);
            continue;
          }
        } else if (fileType === 'sales_reps') {
          // Ensure required fields for sales reps
          if (!record.rep_id || !record.name) {
            errors.push(`Row ${i + 1}: Missing required fields (rep_id, name)`);
            continue;
          }
        }

        transformedData.push(record);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Row ${i + 1}: Parse error - ${errorMsg}`);
      }
    }

    console.log(`🔄 Transformed ${transformedData.length} records with ${errors.length} errors`);

    if (transformedData.length === 0) {
      throw new Error('No valid records to import');
    }

    // Batch processing for performance
    const tableName = fileType === 'sales_reps' ? 'sales_reps' : fileType;
    const conflictColumns = fileType === 'accounts' ? 'build_id,sfdc_account_id' : 
                          fileType === 'opportunities' ? 'build_id,sfdc_opportunity_id' :
                          'build_id,rep_id';

    let totalImported = 0;
    const batchCount = Math.ceil(transformedData.length / batchSize);
    
    console.log(`📦 Processing ${batchCount} batches of size ${batchSize}`);

    for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, transformedData.length);
      const batch = transformedData.slice(startIdx, endIdx);

      console.log(`📦 Processing batch ${batchIndex + 1}/${batchCount} (${batch.length} records)`);

      try {
        const { data, error } = await supabase
          .from(tableName)
          .upsert(batch, { 
            onConflict: conflictColumns,
            ignoreDuplicates: false 
          })
          .select('id');

        if (error) {
          console.error(`❌ Batch ${batchIndex + 1} error:`, error);
          errors.push(`Batch ${batchIndex + 1}: ${error.message}`);
        } else {
          const imported = data?.length || batch.length;
          totalImported += imported;
          console.log(`✅ Batch ${batchIndex + 1} completed: ${imported} records imported`);
        }

      } catch (batchError) {
        console.error(`💥 Batch ${batchIndex + 1} exception:`, batchError);
        const errorMsg = batchError instanceof Error ? batchError.message : String(batchError);
        errors.push(`Batch ${batchIndex + 1}: ${errorMsg}`);
      }

      // Add small delay to prevent overwhelming the database
      if (batchIndex < batchCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const result = {
      success: totalImported > 0,
      recordsProcessed: transformedData.length,
      recordsImported: totalImported,
      errors: errors.slice(0, 100), // Limit error list size
      totalErrors: errors.length,
      batches: batchCount,
      processingTime: Date.now()
    };

    console.log(`🏁 Import completed: ${totalImported}/${transformedData.length} records imported`);
    console.log(`📊 Result: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Large import processing error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMsg,
      recordsProcessed: 0,
      recordsImported: 0,
      errors: [errorMsg]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});