// Batch processing service for large file imports
import { supabase } from '@/integrations/supabase/client';

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
    
    // Calculate optimal batch size
    const estimatedRecordSize = 1024; // Rough estimate for account records
    const optimalBatchSize = this.calculateOptimalBatchSize(data.length, estimatedRecordSize);
    finalConfig.batchSize = Math.min(finalConfig.batchSize, optimalBatchSize);

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
      const maxRetries = 2;
      
      try {
        console.log(`📦 Processing batch ${currentBatchIndex + 1}/${totalBatches} (${batch.length} records)${retryCount > 0 ? ` - Retry ${retryCount}` : ''}`);
        
        const { data: result, error } = await supabase
          .from('accounts')
          .insert(batch)
          .select('id');

        if (error) {
          // Retry logic for certain types of errors
          if (retryCount < maxRetries && (error.message.includes('timeout') || error.message.includes('connection') || error.code === 'PGRST301')) {
            console.warn(`⚠️ Batch ${currentBatchIndex + 1} failed, retrying... (${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
            return processBatch(batch, currentBatchIndex, retryCount + 1);
          }
          
          console.error(`❌ Batch ${currentBatchIndex + 1} failed:`, error);
          errors.push(`Batch ${currentBatchIndex + 1}: ${error.message}`);
          failed += batch.length;
        } else {
          console.log(`✅ Batch ${currentBatchIndex + 1} completed: ${result?.length || batch.length} records`);
          imported += result?.length || batch.length;
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
        // Retry logic for network/connection errors
        if (retryCount < maxRetries && error instanceof Error && 
            (error.message.includes('timeout') || error.message.includes('fetch') || error.message.includes('network'))) {
          console.warn(`⚠️ Batch ${currentBatchIndex + 1} error, retrying... (${retryCount + 1}/${maxRetries})`, error.message);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
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

    return {
      success: imported > 0,
      recordsProcessed: processed,
      recordsImported: imported,
      errors,
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

    // Process batches with proper concurrency control
    const activeBatches = new Map<number, Promise<void>>();
    let batchIndex = 0;
    let completedBatches = 0;

    const processBatch = async (batch: any[], currentBatchIndex: number): Promise<void> => {
      const batchStartTime = Date.now();
      
      try {
        console.log(`📦 Processing sales reps batch ${currentBatchIndex + 1}/${totalBatches} (${batch.length} records)`);
        
        const { data: result, error } = await supabase
          .from('sales_reps')
          .insert(batch)
          .select('id');

        if (error) {
          console.error(`❌ Sales reps batch ${currentBatchIndex + 1} failed:`, error);
          errors.push(`Batch ${currentBatchIndex + 1}: ${error.message}`);
          failed += batch.length;
        } else {
          console.log(`✅ Sales reps batch ${currentBatchIndex + 1} completed: ${result?.length || batch.length} records`);
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
        console.log(`⏱️ Sales reps batch ${currentBatchIndex + 1} took ${batchDuration}ms`);

      } catch (error) {
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
}