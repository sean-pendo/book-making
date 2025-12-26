// Batch processing service for large file imports
import { supabase } from '@/integrations/supabase/client';
import { isOpenHeadcountName } from '@/_domain';

export interface BatchConfig {
  batchSize: number;
  maxConcurrentBatches: number;
  progressCallbackInterval: number;
}

export interface ImportProgress {
  processed: number;
  total: number;
  imported: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
  recordsPerSecond?: number;
  estimatedTimeRemaining?: number;
}

export interface BatchImportResult {
  success: boolean;
  recordsProcessed: number;
  recordsImported: number;
  errors: string[];
  warnings: string[];
  duration: number;
  averageRps: number;
}

export class BatchImportService {
  private static readonly DEFAULT_CONFIG: BatchConfig = {
    batchSize: 10,
    maxConcurrentBatches: 1,
    progressCallbackInterval: 500
  };

  private static calculateOptimalBatchSize(dataSize: number, estimatedRecordSize: number): number {
    // Adjust batch size based on data characteristics
    const memoryConstraint = 50 * 1024 * 1024; // 50MB per batch
    const networkOptimal = 1000; // Good balance for network requests
    
    const memoryBasedSize = Math.floor(memoryConstraint / estimatedRecordSize);
    return Math.min(Math.max(memoryBasedSize, 100), networkOptimal);
  }

  static async importAccountsBatch(
    data: any[],
    buildId: string,
    onProgress?: (progress: ImportProgress) => void,
    config: Partial<BatchConfig> = {}
  ): Promise<BatchImportResult> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    
    // Use the batch size from config directly - no cap (caller decides optimal size)
    console.log(`🚀 Starting batch import: ${data.length} records, batch size: ${finalConfig.batchSize} (pure INSERT)`);

    // Split data into batches
    const batches: any[][] = [];
    for (let i = 0; i < data.length; i += finalConfig.batchSize) {
      batches.push(data.slice(i, i + finalConfig.batchSize));
    }

    const totalBatches = batches.length;
    let processed = 0;
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];
    const progressHistory: number[] = [];

    // Process batches with proper concurrency control
    const activeBatches = new Map<number, Promise<void>>();
    let batchIndex = 0;
    let completedBatches = 0;

    const processBatch = async (batch: any[], currentBatchIndex: number, retryCount = 0): Promise<void> => {
      const batchStartTime = Date.now();
      const maxRetries = 4; // More retries for reliability
      
      try {
        console.log(`📦 Processing batch ${currentBatchIndex + 1}/${totalBatches} (${batch.length} records)${retryCount > 0 ? ` - Retry ${retryCount}` : ''}`);
        
        // Don't use .select() - it adds overhead and can cause timeouts on large batches
        const { error } = await supabase
          .from('accounts')
          .insert(batch);

        if (error) {
          // Retry logic for certain types of errors (expanded list)
          const isRetryable = error.message.includes('timeout') || 
                              error.message.includes('connection') || 
                              error.message.includes('statement canceled') ||
                              error.message.includes('Too Many Requests') ||
                              error.code === 'PGRST301' ||
                              error.code === '57014' || // query_canceled
                              error.code === '40001'; // serialization_failure
          
          if (retryCount < maxRetries && isRetryable) {
            const delay = Math.min(2000 * Math.pow(2, retryCount), 10000); // Exponential backoff up to 10s
            console.warn(`⚠️ Batch ${currentBatchIndex + 1} failed (${error.code}), retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return processBatch(batch, currentBatchIndex, retryCount + 1);
          }
          
          console.error(`❌ Batch ${currentBatchIndex + 1} failed:`, error);
          errors.push(`Batch ${currentBatchIndex + 1}: ${error.message}`);
          failed += batch.length;
        } else {
          console.log(`✅ Batch ${currentBatchIndex + 1} completed: ${batch.length} records`);
          imported += batch.length;
        }
        
        processed += batch.length;
        completedBatches++;
        
        // Update progress with performance metrics
        if (onProgress && (completedBatches % Math.ceil(finalConfig.progressCallbackInterval / finalConfig.batchSize) === 0 || completedBatches === totalBatches)) {
          const currentTime = Date.now();
          const elapsed = (currentTime - startTime) / 1000;
          const rps = processed / elapsed;
          progressHistory.push(rps);
          
          // Calculate moving average RPS
          const recentRps = progressHistory.slice(-5).reduce((sum, r) => sum + r, 0) / Math.min(5, progressHistory.length);
          const remaining = data.length - processed;
          const eta = remaining / recentRps;

          onProgress({
            processed,
            total: data.length,
            imported,
            failed,
            currentBatch: completedBatches,
            totalBatches,
            recordsPerSecond: recentRps,
            estimatedTimeRemaining: eta
          });
        }

        const batchDuration = Date.now() - batchStartTime;
        console.log(`⏱️ Batch ${currentBatchIndex + 1} took ${batchDuration}ms (${(batch.length / (batchDuration / 1000)).toFixed(1)} rps)`);

      } catch (error) {
        // Retry logic for network/connection errors (expanded)
        const isRetryable = error instanceof Error && 
            (error.message.includes('timeout') || 
             error.message.includes('fetch') || 
             error.message.includes('network') ||
             error.message.includes('Failed to fetch') ||
             error.message.includes('aborted'));
        
        if (retryCount < maxRetries && isRetryable) {
          const delay = Math.min(2000 * Math.pow(2, retryCount), 10000);
          console.warn(`⚠️ Batch ${currentBatchIndex + 1} error, retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`, error instanceof Error ? error.message : '');
          await new Promise(resolve => setTimeout(resolve, delay));
          return processBatch(batch, currentBatchIndex, retryCount + 1);
        }
        
        console.error(`💥 Batch ${currentBatchIndex + 1} error:`, error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Batch ${currentBatchIndex + 1}: ${errorMsg}`);
        failed += batch.length;
        processed += batch.length;
        completedBatches++;
      } finally {
        // Remove this batch from active tracking
        activeBatches.delete(currentBatchIndex);
      }
    };

    // Process all batches with controlled concurrency
    while (batchIndex < batches.length || activeBatches.size > 0) {
      // Start new batches up to the concurrency limit
      while (activeBatches.size < finalConfig.maxConcurrentBatches && batchIndex < batches.length) {
        const currentIndex = batchIndex;
        const batchPromise = processBatch(batches[currentIndex], currentIndex);
        activeBatches.set(currentIndex, batchPromise);
        batchIndex++;
        
        // Small delay between starting batches to avoid overwhelming Supabase
        if (batchIndex < batches.length) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }

      // Wait for at least one batch to complete
      if (activeBatches.size > 0) {
        await Promise.race(Array.from(activeBatches.values()));
      }
    }

    // Final progress update
    if (onProgress) {
      const totalDuration = Date.now() - startTime;
      const averageRps = processed / (totalDuration / 1000);
      
      onProgress({
        processed,
        total: data.length,
        imported,
        failed,
        currentBatch: totalBatches,
        totalBatches,
        recordsPerSecond: averageRps,
        estimatedTimeRemaining: 0
      });
    }

    const duration = Date.now() - startTime;
    const averageRps = processed / (duration / 1000);

    console.log(`🏁 Batch import completed in ${duration}ms. Processed: ${processed}, Imported: ${imported}, Failed: ${failed}, Average RPS: ${averageRps.toFixed(1)}`);

    // After accounts import, sync is_customer based on hierarchy_bookings_arr_converted
    if (imported > 0) {
      try {
        console.log('🔄 Syncing is_customer field based on hierarchy_bookings_arr_converted...');
        await this.syncIsCustomerField(buildId);
      } catch (syncError) {
        console.warn('⚠️ is_customer sync failed (non-fatal):', syncError);
        // Don't fail the import if sync fails - can be fixed by re-running migration
      }
    }

    return {
      success: imported > 0,
      recordsProcessed: processed,
      recordsImported: imported,
      errors,
      warnings: [],
      duration,
      averageRps
    };
  }

  /**
   * Optimized opportunities import - deletes existing records first,
   * then does pure bulk INSERTs without any conflict checking.
   * This avoids expensive unique constraint checks that cause timeouts.
   */
  static async importOpportunitiesOptimized(
    data: any[],
    buildId: string,
    onProgress?: (progress: ImportProgress) => void,
    config: Partial<BatchConfig> = {}
  ): Promise<BatchImportResult> {
    // Use batch size of 100 for fast imports (trigger removed, no more timeouts)
    const finalConfig = { ...this.DEFAULT_CONFIG, batchSize: 100, maxConcurrentBatches: 2, ...config };
    const startTime = Date.now();
    
    console.log(`🚀 Starting OPTIMIZED opportunities import: ${data.length} records`);
    console.log(`⚙️ Configuration: batchSize=${finalConfig.batchSize}, maxConcurrent=${finalConfig.maxConcurrentBatches}`);
    console.log(`💡 Strategy: Pure INSERT (existing records already cleared to avoid timeout)`);

    // Since existing opportunities were already deleted, ALL records are new
    // We can do pure INSERTs without any conflict checking
    const newRecords = data;
    console.log(`📊 All ${newRecords.length} records will be inserted (existing already cleared)`);

    let processed = 0;
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    // Prepare insert batches
    const insertBatches: any[][] = [];
    for (let i = 0; i < newRecords.length; i += finalConfig.batchSize) {
      insertBatches.push(newRecords.slice(i, i + finalConfig.batchSize));
    }

    console.log(`📦 Created ${insertBatches.length} insert batches (pure INSERT, no conflict checking)`);

    // Process INSERT batches
    if (newRecords.length > 0) {
      console.log(`📥 Bulk inserting ${newRecords.length} new opportunities...`);

      for (let i = 0; i < insertBatches.length; i++) {
        const batch = insertBatches[i];
        const batchNum = i + 1;
        
        try {
          console.log(`📦 Inserting batch ${batchNum}/${insertBatches.length} (${batch.length} records)...`);
          
          // Remove .select() to reduce overhead and improve performance
          const { error } = await supabase
            .from('opportunities')
            .insert(batch);

          if (error) {
            console.error(`❌ Batch ${batchNum} insert failed:`, error);
            
            // FALLBACK: Try inserting records individually
            console.log(`🔄 Batch ${batchNum} failed. Attempting individual inserts for ${batch.length} records...`);
            
            let batchImported = 0;
            let batchFailed = 0;
            
            for (const record of batch) {
              try {
                const { error: singleError } = await supabase
                  .from('opportunities')
                  .insert(record);
                
                if (singleError) {
                  console.error(`❌ Failed ${record.sfdc_opportunity_id}:`, singleError.message);
                  errors.push(`${record.sfdc_opportunity_id}: ${singleError.message}`);
                  batchFailed++;
                } else {
                  batchImported++;
                }
              } catch (singleErr) {
                console.error(`💥 Individual insert error ${record.sfdc_opportunity_id}:`, singleErr);
                errors.push(`${record.sfdc_opportunity_id}: ${singleErr instanceof Error ? singleErr.message : 'Unknown'}`);
                batchFailed++;
              }
            }
            
            imported += batchImported;
            failed += batchFailed;
            console.log(`📊 Batch ${batchNum} individual results: ${batchImported} succeeded, ${batchFailed} failed`);
          } else {
            imported += batch.length;
            console.log(`✅ Batch ${batchNum}/${insertBatches.length} inserted: ${batch.length} records (Total: ${imported})`);
          }
          
          processed += batch.length;

          if (onProgress) {
            onProgress({
              processed,
              total: data.length,
              imported,
              failed,
              currentBatch: batchNum,
              totalBatches: insertBatches.length,
              recordsPerSecond: processed / ((Date.now() - startTime) / 1000),
              estimatedTimeRemaining: (data.length - processed) / (processed / ((Date.now() - startTime) / 1000))
            });
          }
          
          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 50));
          
        } catch (error) {
          console.error(`💥 Batch ${batchNum} critical error:`, error);
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Batch ${batchNum}: ${errorMsg}`);
          failed += batch.length;
          processed += batch.length;
        }
      }
    }

    const duration = Date.now() - startTime;
    const averageRps = processed / (duration / 1000);

    console.log(`🏁 OPTIMIZED import completed in ${duration}ms. Processed: ${processed}, Imported: ${imported}, Failed: ${failed}, Average RPS: ${averageRps.toFixed(1)}`);
    
    return {
      success: imported > 0,
      recordsProcessed: processed,
      recordsImported: imported,
      errors,
      warnings: [],
      duration,
      averageRps
    };
  }

  static async importOpportunitiesBatch(
    data: any[],
    buildId: string,
    onProgress?: (progress: ImportProgress) => void,
    config: Partial<BatchConfig> = {}
  ): Promise<BatchImportResult> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    
    console.log(`🚀 Starting opportunities batch import: ${data.length} records, batch size: ${finalConfig.batchSize}`);

    // Split data into batches
    const batches: any[][] = [];
    for (let i = 0; i < data.length; i += finalConfig.batchSize) {
      batches.push(data.slice(i, i + finalConfig.batchSize));
    }

    const totalBatches = batches.length;
    let processed = 0;
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];
    const progressHistory: number[] = [];

    // Process batches with proper concurrency control
    const activeBatches = new Map<number, Promise<void>>();
    let batchIndex = 0;
    let completedBatches = 0;

    const processBatch = async (batch: any[], currentBatchIndex: number, retryCount = 0): Promise<void> => {
      const batchStartTime = Date.now();
      const maxRetries = 3;
      
      try {
        console.log(`📦 Processing opportunities batch ${currentBatchIndex + 1}/${totalBatches} (${batch.length} records)${retryCount > 0 ? ` - Retry ${retryCount}` : ''}`);
        
        const { data: result, error } = await supabase
          .from('opportunities')
          .upsert(batch, { 
            onConflict: 'build_id,sfdc_opportunity_id',
            ignoreDuplicates: false 
          })
          .select('id');

        if (error) {
          // Retry logic for timeout errors
          if (retryCount < maxRetries && (error.message.includes('timeout') || error.message.includes('statement timeout') || error.code === '57014')) {
            console.warn(`⚠️ Opportunities batch ${currentBatchIndex + 1} timeout, retrying... (${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1))); // Exponential backoff
            return processBatch(batch, currentBatchIndex, retryCount + 1);
          }
          
          console.error(`❌ Opportunities batch ${currentBatchIndex + 1} failed:`, error);
          errors.push(`Batch ${currentBatchIndex + 1}: ${error.message}`);
          failed += batch.length;
        } else {
          console.log(`✅ Opportunities batch ${currentBatchIndex + 1} completed: ${result?.length || batch.length} records`);
          imported += result?.length || batch.length;
        }
        
        processed += batch.length;
        completedBatches++;
        
        // Update progress
        if (onProgress && (completedBatches % Math.ceil(finalConfig.progressCallbackInterval / finalConfig.batchSize) === 0 || completedBatches === totalBatches)) {
          const currentTime = Date.now();
          const elapsed = (currentTime - startTime) / 1000;
          const rps = processed / elapsed;
          
          onProgress({
            processed,
            total: data.length,
            imported,
            failed,
            currentBatch: completedBatches,
            totalBatches,
            recordsPerSecond: rps,
            estimatedTimeRemaining: (data.length - processed) / rps
          });
        }

        const batchDuration = Date.now() - batchStartTime;
        console.log(`⏱️ Opportunities batch ${currentBatchIndex + 1} took ${batchDuration}ms`);

      } catch (error) {
        // Retry logic for network/connection errors
        if (retryCount < maxRetries && error instanceof Error && 
            (error.message.includes('timeout') || error.message.includes('fetch') || error.message.includes('network') || error.message.includes('statement timeout'))) {
          console.warn(`⚠️ Opportunities batch ${currentBatchIndex + 1} error, retrying... (${retryCount + 1}/${maxRetries})`, error.message);
          await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
          return processBatch(batch, currentBatchIndex, retryCount + 1);
        }
        
        console.error(`💥 Opportunities batch ${currentBatchIndex + 1} error:`, error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Batch ${currentBatchIndex + 1}: ${errorMsg}`);
        failed += batch.length;
        processed += batch.length;
        completedBatches++;
      } finally {
        activeBatches.delete(currentBatchIndex);
      }
    };

    // Process all batches with controlled concurrency
    while (batchIndex < batches.length || activeBatches.size > 0) {
      // Start new batches up to the concurrency limit
      while (activeBatches.size < finalConfig.maxConcurrentBatches && batchIndex < batches.length) {
        const currentIndex = batchIndex;
        const batchPromise = processBatch(batches[currentIndex], currentIndex);
        activeBatches.set(currentIndex, batchPromise);
        batchIndex++;
      }

      // Wait for at least one batch to complete
      if (activeBatches.size > 0) {
        await Promise.race(Array.from(activeBatches.values()));
      }
    }

    const duration = Date.now() - startTime;
    const averageRps = processed / (duration / 1000);

    console.log(`🏁 Opportunities batch import completed in ${duration}ms. Processed: ${processed}, Imported: ${imported}, Failed: ${failed}, Average RPS: ${averageRps.toFixed(1)}`);

    // Auto-calculate ATR for accounts after opportunities import
    if (imported > 0) {
      try {
        console.log('📊 Auto-calculating ATR from renewal opportunities...');
        await this.calculateATRFromOpportunities(buildId);
      } catch (atrError) {
        console.warn('⚠️ ATR calculation failed (non-fatal):', atrError);
        // Don't fail the import if ATR calculation fails
      }
    }

    return {
      success: imported > 0,
      recordsProcessed: processed,
      recordsImported: imported,
      errors,
      warnings: [],
      duration,
      averageRps
    };
  }

  static async importSalesRepsBatch(
    data: any[],
    buildId: string,
    onProgress?: (progress: ImportProgress) => void,
    config: Partial<BatchConfig> = {}
  ): Promise<BatchImportResult> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    
    console.log(`🚀 Starting sales reps batch import: ${data.length} records, batch size: ${finalConfig.batchSize} (pure INSERT)`);

    // STEP 0: Delete existing sales reps for this build to avoid unique constraint violations
    console.log(`🗑️ Deleting existing sales reps for build ${buildId}...`);
    const { error: deleteError, count: deleteCount } = await supabase
      .from('sales_reps')
      .delete({ count: 'exact' })
      .eq('build_id', buildId);
    
    if (deleteError) {
      console.error('❌ Failed to delete existing sales reps:', deleteError);
      return {
        success: false,
        recordsProcessed: 0,
        recordsImported: 0,
        errors: [`Failed to clear existing sales reps: ${deleteError.message}`],
        warnings: [],
        duration: Date.now() - startTime,
        averageRps: 0
      };
    }
    console.log(`✅ Deleted ${deleteCount ?? 'unknown'} existing sales reps for build`);

    // Pre-process data: Auto-generate rep_id for open headcount (blank rep_id),
    // handle duplicates, and process is_backfill_source flag
    // @see MASTER_LOGIC.mdc §8.4 - Placeholder/Open Headcount
    let placeholderCount = 0;
    let backfillSourceCount = 0;
    let autoNumberedCount = 0;
    const warnings: string[] = [];
    
    // STEP 1: First pass - handle blank/placeholder rep_ids
    const firstPassData = data.map(row => {
      const processed = { ...row };
      
      // Auto-generate rep_id if blank (but NOT for duplicate non-blank IDs yet)
      if (!processed.rep_id || processed.rep_id.trim() === '') {
        if (processed.name) {
          processed.rep_id = `OPEN-${buildId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          processed.is_placeholder = true;
          placeholderCount++;
          console.log(`📝 Auto-generated rep_id for "${processed.name}": ${processed.rep_id}`);
        }
      }
      
      // If marked as backfill source, also set include_in_assignments = false
      if (processed.is_backfill_source === true || processed.is_backfill_source === 'true') {
        processed.is_backfill_source = true;
        processed.include_in_assignments = false;
        backfillSourceCount++;
        console.log(`🔄 Rep "${processed.name}" marked as backfill source (excluded from assignments)`);
      }
      
      return processed;
    });

    // STEP 2: Detect and handle duplicate rep_ids
    // @see MASTER_LOGIC.mdc §8.4.2 - Duplicate Rep ID Handling
    const repIdGroups = new Map<string, typeof firstPassData>();
    for (const row of firstPassData) {
      const repId = row.rep_id?.trim();
      if (!repId) continue;
      
      if (!repIdGroups.has(repId)) {
        repIdGroups.set(repId, []);
      }
      repIdGroups.get(repId)!.push(row);
    }
    
    // Helper to check if two rows differ in any distinguishing field
    const rowsAreDifferent = (a: any, b: any): boolean => {
      const fieldsToCompare = ['name', 'region', 'team', 'flm', 'slm', 'team_tier', 'pe_firms'];
      for (const field of fieldsToCompare) {
        const valA = (a[field] ?? '').toString().trim().toLowerCase();
        const valB = (b[field] ?? '').toString().trim().toLowerCase();
        if (valA !== valB) return true;
      }
      return false;
    };
    
    // Process duplicate groups
    const processedData: typeof firstPassData = [];
    for (const [repId, rows] of repIdGroups) {
      if (rows.length === 1) {
        // No duplicates, keep as-is
        processedData.push(rows[0]);
      } else {
        // Multiple rows with same rep_id
        console.log(`⚠️ Found ${rows.length} rows with rep_id "${repId}"`);
        
        // Check if any row has Open Headcount name pattern OR if rows differ in fields
        const hasOpenHeadcountName = rows.some(r => isOpenHeadcountName(r.name));
        const rowsHaveDifferences = rows.some((row, i) => 
          i > 0 && rowsAreDifferent(rows[0], row)
        );
        
        if (hasOpenHeadcountName || rowsHaveDifferences) {
          // Auto-number: append -1, -2, -3, etc.
          console.log(`📋 Auto-numbering ${rows.length} reps with rep_id "${repId}" (Open Headcount pattern or fields differ)`);
          rows.forEach((row, idx) => {
            const newRepId = `${repId}-${idx + 1}`;
            console.log(`  → "${row.name}": ${repId} → ${newRepId}`);
            row.rep_id = newRepId;
            row.is_placeholder = true;
            autoNumberedCount++;
            processedData.push(row);
          });
        } else {
          // True duplicates (all fields identical) - warn but still import
          // Database constraint will reject duplicates, first one wins
          warnings.push(`Duplicate rep_id "${repId}" found for ${rows.length} identical rows. Only the first will be imported.`);
          console.warn(`⚠️ True duplicate rep_id "${repId}" - all fields identical, only first will succeed`);
          processedData.push(...rows);
        }
      }
    }

    if (placeholderCount > 0) {
      console.log(`📋 Generated placeholder IDs for ${placeholderCount} open headcount reps (blank rep_id)`);
    }
    if (autoNumberedCount > 0) {
      console.log(`📋 Auto-numbered ${autoNumberedCount} reps with duplicate rep_ids`);
    }
    if (backfillSourceCount > 0) {
      console.log(`📋 Marked ${backfillSourceCount} reps as backfill sources (excluded from assignments)`);
    }
    if (warnings.length > 0) {
      console.warn(`⚠️ ${warnings.length} warning(s) during pre-processing`);
    }

    // Split processed data into batches
    const batches: any[][] = [];
    for (let i = 0; i < processedData.length; i += finalConfig.batchSize) {
      batches.push(processedData.slice(i, i + finalConfig.batchSize));
    }

    const totalBatches = batches.length;
    let processed = 0;
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process batches with proper concurrency control
    const activeBatches = new Map<number, Promise<void>>();
    let batchIndex = 0;
    let completedBatches = 0;

    const processBatch = async (batch: any[], currentBatchIndex: number, retryCount = 0): Promise<void> => {
      const batchStartTime = Date.now();
      const maxRetries = 4;
      
      try {
        console.log(`📦 Processing sales reps batch ${currentBatchIndex + 1}/${totalBatches} (${batch.length} records)${retryCount > 0 ? ` - Retry ${retryCount}` : ''}`);
        
        // Log sample data for debugging on first batch
        if (currentBatchIndex === 0 && batch.length > 0) {
          console.log(`🔍 Sample sales rep data (first record):`, JSON.stringify(batch[0], null, 2));
          console.log(`🔍 Fields being sent:`, Object.keys(batch[0]));
        }
        
        // Don't use .select() - reduces overhead
        const { error } = await supabase
          .from('sales_reps')
          .insert(batch);

        if (error) {
          const isRetryable = error.message.includes('timeout') || 
                              error.message.includes('connection') || 
                              error.message.includes('statement canceled') ||
                              error.code === 'PGRST301' ||
                              error.code === '57014';
          
          if (retryCount < maxRetries && isRetryable) {
            const delay = Math.min(2000 * Math.pow(2, retryCount), 10000);
            console.warn(`⚠️ Sales reps batch ${currentBatchIndex + 1} failed, retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return processBatch(batch, currentBatchIndex, retryCount + 1);
          }
          
          console.error(`❌ Sales reps batch ${currentBatchIndex + 1} failed:`, error);
          console.error(`❌ Error details - code: ${error.code}, hint: ${error.hint}, details: ${error.details}`);
          console.error(`❌ Sample failed record:`, JSON.stringify(batch[0], null, 2));
          errors.push(`Batch ${currentBatchIndex + 1}: ${error.message}`);
          failed += batch.length;
        } else {
          console.log(`✅ Sales reps batch ${currentBatchIndex + 1} completed: ${batch.length} records`);
          imported += batch.length;
        }
        
        processed += batch.length;
        completedBatches++;
        
        // Update progress
        if (onProgress && (completedBatches % Math.ceil(finalConfig.progressCallbackInterval / finalConfig.batchSize) === 0 || completedBatches === totalBatches)) {
          const currentTime = Date.now();
          const elapsed = (currentTime - startTime) / 1000;
          const rps = processed / elapsed;
          
          onProgress({
            processed,
            total: data.length,
            imported,
            failed,
            currentBatch: completedBatches,
            totalBatches,
            recordsPerSecond: rps,
            estimatedTimeRemaining: (data.length - processed) / rps
          });
        }

        const batchDuration = Date.now() - batchStartTime;
        console.log(`⏱️ Sales reps batch ${currentBatchIndex + 1} took ${batchDuration}ms`);

      } catch (error) {
        const isRetryable = error instanceof Error && 
            (error.message.includes('timeout') || 
             error.message.includes('fetch') || 
             error.message.includes('network') ||
             error.message.includes('Failed to fetch'));
        
        if (retryCount < maxRetries && isRetryable) {
          const delay = Math.min(2000 * Math.pow(2, retryCount), 10000);
          console.warn(`⚠️ Sales reps batch ${currentBatchIndex + 1} error, retrying in ${delay}ms...`, error instanceof Error ? error.message : '');
          await new Promise(resolve => setTimeout(resolve, delay));
          return processBatch(batch, currentBatchIndex, retryCount + 1);
        }
        
        console.error(`💥 Sales reps batch ${currentBatchIndex + 1} error:`, error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Batch ${currentBatchIndex + 1}: ${errorMsg}`);
        failed += batch.length;
        processed += batch.length;
        completedBatches++;
      } finally {
        activeBatches.delete(currentBatchIndex);
      }
    };

    // Process all batches with controlled concurrency
    while (batchIndex < batches.length || activeBatches.size > 0) {
      // Start new batches up to the concurrency limit
      while (activeBatches.size < finalConfig.maxConcurrentBatches && batchIndex < batches.length) {
        const currentIndex = batchIndex;
        const batchPromise = processBatch(batches[currentIndex], currentIndex);
        activeBatches.set(currentIndex, batchPromise);
        batchIndex++;
        
        // Small delay between starting batches
        if (batchIndex < batches.length) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }

      // Wait for at least one batch to complete
      if (activeBatches.size > 0) {
        await Promise.race(Array.from(activeBatches.values()));
      }
    }

    const duration = Date.now() - startTime;
    const averageRps = processed / (duration / 1000);

    console.log(`🏁 Sales reps batch import completed in ${duration}ms. Processed: ${processed}, Imported: ${imported}, Failed: ${failed}, Average RPS: ${averageRps.toFixed(1)}`);
    
    return {
      success: imported > 0,
      recordsProcessed: processed,
      recordsImported: imported,
      errors,
      warnings,
      duration,
      averageRps
    };
  }

  /**
   * Calculate ATR (Available To Renew) from renewal opportunities and update accounts
   * Only updates accounts where calculated_atr is NULL or 0
   */
  static async calculateATRFromOpportunities(buildId: string): Promise<void> {
    console.log(`📊 Calculating ATR for build ${buildId}...`);

    try {
      // First check if there are any accounts for this build
      const { count: accountCount, error: countError } = await supabase
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .eq('build_id', buildId);

      if (countError) throw countError;

      if (!accountCount || accountCount === 0) {
        console.log('ℹ️ No accounts found for this build, skipping ATR calculation');
        return;
      }

      // Get all renewal opportunities with ATR values
      const { data: renewalOpps, error: oppsError } = await supabase
        .from('opportunities')
        .select('sfdc_account_id, available_to_renew')
        .eq('build_id', buildId)
        .eq('opportunity_type', 'Renewals')
        .not('available_to_renew', 'is', null);

      if (oppsError) throw oppsError;

      if (!renewalOpps || renewalOpps.length === 0) {
        console.log('ℹ️ No renewal opportunities with ATR found, skipping calculation');
        return;
      }

      // Aggregate ATR by account
      const atrByAccount = new Map<string, number>();
      renewalOpps.forEach(opp => {
        const currentATR = atrByAccount.get(opp.sfdc_account_id) || 0;
        atrByAccount.set(opp.sfdc_account_id, currentATR + (opp.available_to_renew || 0));
      });

      console.log(`📊 Calculated ATR for ${atrByAccount.size} accounts from ${renewalOpps.length} renewal opportunities`);

      // Update accounts in batches (only where calculated_atr is NULL or 0)
      const updates: Array<{sfdc_account_id: string, calculated_atr: number}> = [];
      for (const [accountId, atr] of atrByAccount.entries()) {
        // First check if account needs updating
        const { data: account } = await supabase
          .from('accounts')
          .select('calculated_atr')
          .eq('build_id', buildId)
          .eq('sfdc_account_id', accountId)
          .single();

        // Only update if calculated_atr is NULL or 0
        if (!account || account.calculated_atr === null || account.calculated_atr === 0) {
          const { error: updateError } = await supabase
            .from('accounts')
            .update({ calculated_atr: atr })
            .eq('build_id', buildId)
            .eq('sfdc_account_id', accountId);

          if (updateError) {
            console.warn(`⚠️ Failed to update ATR for account ${accountId}:`, updateError);
          } else {
            updates.push({ sfdc_account_id: accountId, calculated_atr: atr });
          }
        }
      }

      console.log(`✅ ATR calculation completed: Updated ${updates.length} accounts`);
    } catch (error) {
      console.error('❌ ATR calculation failed:', error);
      throw error;
    }
  }

  /**
   * Sync is_customer field for parent accounts.
   * 
   * SSOT: A parent account is a customer if:
   * 1. hierarchy_bookings_arr_converted > 0 (has direct ARR), OR
   * 2. has_customer_hierarchy = true (has customer children)
   * 
   * @see _domain/calculations.ts isParentCustomer()
   * @see _domain/MASTER_LOGIC.mdc §3.1.1
   */
  static async syncIsCustomerField(buildId: string): Promise<void> {
    console.log(`🔄 Syncing is_customer field for build ${buildId}...`);

    try {
      // Step 1: Set ALL parent accounts to is_customer = false first (clean slate)
      const { error: resetError } = await supabase
        .from('accounts')
        .update({ is_customer: false })
        .eq('build_id', buildId)
        .eq('is_parent', true);

      if (resetError) throw resetError;

      // Step 2: Set is_customer = true for accounts with hierarchy_bookings_arr_converted > 0
      // This matches SSOT getAccountARR priority chain step 1
      const { error: hierarchyArrError } = await supabase
        .from('accounts')
        .update({ is_customer: true })
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .gt('hierarchy_bookings_arr_converted', 0);

      if (hierarchyArrError) throw hierarchyArrError;

      // Step 3: Set is_customer = true for accounts with calculated_arr > 0
      // This matches SSOT getAccountARR priority chain step 2
      const { error: calculatedArrError } = await supabase
        .from('accounts')
        .update({ is_customer: true })
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .gt('calculated_arr', 0);

      if (calculatedArrError) throw calculatedArrError;

      // Step 4: Set is_customer = true for accounts with arr > 0
      // This matches SSOT getAccountARR priority chain step 3
      const { error: arrError } = await supabase
        .from('accounts')
        .update({ is_customer: true })
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .gt('arr', 0);

      if (arrError) throw arrError;

      // Step 5: Set is_customer = true for accounts with customer children (even if no direct ARR)
      const { error: hierarchyError } = await supabase
        .from('accounts')
        .update({ is_customer: true })
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .eq('has_customer_hierarchy', true);

      if (hierarchyError) throw hierarchyError;

      // Log results
      const { count: customerCount } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .eq('is_customer', true);

      const { count: prospectCount } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .eq('is_customer', false);

      console.log(`✅ is_customer sync completed: ${customerCount} customers, ${prospectCount} prospects`);
    } catch (error) {
      console.error('❌ is_customer sync failed:', error);
      throw error;
    }
  }

  /**
   * Sync renewal fields from opportunities to accounts.
   * 
   * - renewal_quarter: Set on PARENT accounts using rolled-up earliest date from hierarchy
   *   Format: "Q4-FY27" (fiscal year starts Feb 1)
   * - renewal_date: Set on ALL accounts (parent and child) with their individual earliest date
   * 
   * Opportunity data always overwrites any CSV-imported values for renewal_date.
   */
  static async syncRenewalQuarterFromOpportunities(buildId: string): Promise<void> {
    console.log(`🔄 Syncing renewal fields from opportunities for build ${buildId}...`);

    try {
      // Import fiscal year calculation function
      const { getFiscalQuarterLabel } = await import('@/utils/fiscalYearCalculations');

      // Get all opportunities with renewal_event_date for this build
      const { data: opportunities, error: oppsError } = await supabase
        .from('opportunities')
        .select('sfdc_account_id, renewal_event_date')
        .eq('build_id', buildId)
        .not('renewal_event_date', 'is', null);

      if (oppsError) throw oppsError;

      if (!opportunities || opportunities.length === 0) {
        console.log('ℹ️ No opportunities with renewal_event_date found, skipping renewal sync');
        return;
      }

      // Get all accounts to build the hierarchy mapping (child -> parent)
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('sfdc_account_id, ultimate_parent_id, is_parent')
        .eq('build_id', buildId);

      if (accountsError) throw accountsError;

      if (!accounts || accounts.length === 0) {
        console.log('ℹ️ No accounts found, skipping renewal sync');
        return;
      }

      // Build a map: account_id -> ultimate_parent_id (or self if it's a parent)
      const accountToParentMap = new Map<string, string>();
      for (const account of accounts) {
        const accountId = account.sfdc_account_id;
        // If account has an ultimate_parent_id and it's not self-referencing, use it
        // Otherwise, use the account itself (it's a parent account)
        const parentId = account.ultimate_parent_id && account.ultimate_parent_id !== accountId
          ? account.ultimate_parent_id
          : accountId;
        accountToParentMap.set(accountId, parentId);
      }

      // Build BOTH maps in a single loop over opportunities:
      // 1. earliestRenewalByParent - for renewal_quarter (rolled up to parent)
      // 2. earliestRenewalByAccount - for renewal_date (individual per account)
      const earliestRenewalByParent = new Map<string, string>();
      const earliestRenewalByAccount = new Map<string, string>();
      
      for (const opp of opportunities) {
        const accountId = opp.sfdc_account_id;
        const renewalDate = opp.renewal_event_date;
        
        if (!renewalDate) continue;
        
        // 1. Individual account renewal_date (for stability check)
        const currentAccountEarliest = earliestRenewalByAccount.get(accountId);
        if (!currentAccountEarliest || new Date(renewalDate) < new Date(currentAccountEarliest)) {
          earliestRenewalByAccount.set(accountId, renewalDate);
        }
        
        // 2. Parent rollup for renewal_quarter (for reporting)
        const parentId = accountToParentMap.get(accountId) || accountId;
        const currentParentEarliest = earliestRenewalByParent.get(parentId);
        if (!currentParentEarliest || new Date(renewalDate) < new Date(currentParentEarliest)) {
          earliestRenewalByParent.set(parentId, renewalDate);
        }
      }

      console.log(`📊 Found renewal dates for ${earliestRenewalByParent.size} parent accounts (rollup) and ${earliestRenewalByAccount.size} individual accounts`);

      // Update PARENT accounts with their rolled-up renewal_quarter
      let quarterUpdatedCount = 0;
      const quarterFailures: string[] = [];
      
      for (const [parentId, renewalDate] of earliestRenewalByParent.entries()) {
        const quarterLabel = getFiscalQuarterLabel(renewalDate);
        
        if (quarterLabel) {
          const { error: updateError } = await supabase
            .from('accounts')
            .update({ renewal_quarter: quarterLabel })
            .eq('build_id', buildId)
            .eq('sfdc_account_id', parentId);

          if (updateError) {
            quarterFailures.push(parentId);
            console.warn(`⚠️ Failed to update renewal_quarter for parent ${parentId}:`, updateError);
          } else {
            quarterUpdatedCount++;
          }
        }
      }

      if (quarterFailures.length > 0) {
        console.error(`❌ Failed to update renewal_quarter for ${quarterFailures.length} accounts`);
      }
      console.log(`✅ renewal_quarter sync completed: Updated ${quarterUpdatedCount} parent accounts`);

      // Batch update renewal_date for ALL accounts (parent and child)
      // Opportunity data always overwrites any CSV-imported values
      const BATCH_SIZE = 500;
      const entries = Array.from(earliestRenewalByAccount.entries());
      let renewalDateUpdates = 0;
      const dateFailures: string[] = [];

      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.all(batch.map(([accountId, renewalDate]) =>
          supabase
            .from('accounts')
            .update({ renewal_date: renewalDate })  // renewalDate is already a string
            .eq('build_id', buildId)
            .eq('sfdc_account_id', accountId)
            .then(({ error }) => ({ accountId, error }))
        ));
        
        for (const { accountId, error } of results) {
          if (error) {
            dateFailures.push(accountId);
            console.warn(`⚠️ Failed to update renewal_date for ${accountId}:`, error);
          } else {
            renewalDateUpdates++;
          }
        }
      }

      if (dateFailures.length > 0) {
        console.error(`❌ Failed to update renewal_date for ${dateFailures.length} accounts`);
      }
      console.log(`✅ renewal_date sync completed: Updated ${renewalDateUpdates} accounts`);

    } catch (error) {
      console.error('❌ renewal sync failed:', error);
      throw error;
    }
  }
}