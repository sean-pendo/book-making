// Streaming CSV parser for large files with memory optimization
import { EnhancedCSVParser, ParsedCSVResult, ParseError } from '@/utils/enhancedCsvParser';

export interface StreamingParseConfig {
  chunkSize: number; // Size of each chunk to read
  maxMemoryUsage: number; // Maximum memory to use for buffering
  onProgress?: (progress: StreamingProgress) => void;
  onChunkParsed?: (chunk: any[], chunkIndex: number) => Promise<void>;
}

export interface StreamingProgress {
  bytesProcessed: number;
  totalBytes: number;
  rowsProcessed: number;
  chunksProcessed: number;
  memoryUsage: number;
  parseRate: number; // rows per second
}

export interface StreamingParseResult {
  totalRows: number;
  validRows: number;
  errors: ParseError[];
  warnings: string[];
  headers: string[];
  memoryPeak: number;
  duration: number;
  parseRate: number;
}

export class StreamingCsvParser {
  private static readonly DEFAULT_CONFIG: StreamingParseConfig = {
    chunkSize: 1024 * 1024, // 1MB chunks
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB max memory
  };

  private static estimateMemoryUsage(): number {
    // Rough estimation of current memory usage
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize || 0;
    }
    return 0;
  }

  private static processCompleteLines(buffer: string, delimiter: string): {
    completeLines: string[];
    remainingBuffer: string;
  } {
    const lines = buffer.split('\n');
    const remainingBuffer = lines.pop() || ''; // Keep incomplete last line
    return {
      completeLines: lines.filter(line => line.trim() !== ''),
      remainingBuffer
    };
  }

  static async parseFileStream(
    file: File,
    config: Partial<StreamingParseConfig> = {}
  ): Promise<StreamingParseResult> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    const startMemory = this.estimateMemoryUsage();

    console.log(`🌊 Starting streaming parse of ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    let offset = 0;
    let buffer = '';
    let headers: string[] = [];
    let delimiter = ',';
    let totalRowsProcessed = 0;
    let validRowsProcessed = 0;
    let chunkIndex = 0;
    const errors: ParseError[] = [];
    const warnings: string[] = [];
    let peakMemory = startMemory;
    let headersParsed = false;

    const updateProgress = () => {
      const currentMemory = this.estimateMemoryUsage();
      peakMemory = Math.max(peakMemory, currentMemory);
      
      const elapsed = (Date.now() - startTime) / 1000;
      const parseRate = totalRowsProcessed / elapsed;

      if (finalConfig.onProgress) {
        finalConfig.onProgress({
          bytesProcessed: offset,
          totalBytes: file.size,
          rowsProcessed: totalRowsProcessed,
          chunksProcessed: chunkIndex,
          memoryUsage: currentMemory,
          parseRate
        });
      }
    };

    try {
      while (offset < file.size) {
        // Memory pressure check
        const currentMemory = this.estimateMemoryUsage();
        if (currentMemory > finalConfig.maxMemoryUsage) {
          console.warn(`⚠️ Memory usage (${(currentMemory / 1024 / 1024).toFixed(1)}MB) exceeds limit, forcing garbage collection`);
          // Force garbage collection if available
          if ('gc' in window && typeof (window as any).gc === 'function') {
            (window as any).gc();
          }
          
          // If still over limit, reduce chunk size
          if (this.estimateMemoryUsage() > finalConfig.maxMemoryUsage) {
            finalConfig.chunkSize = Math.max(finalConfig.chunkSize / 2, 64 * 1024); // Minimum 64KB
            console.log(`📉 Reducing chunk size to ${(finalConfig.chunkSize / 1024).toFixed(0)}KB due to memory pressure`);
          }
        }

        // Read chunk
        const chunk = file.slice(offset, offset + finalConfig.chunkSize);
        const text = await chunk.text();
        buffer += text;
        offset += finalConfig.chunkSize;
        chunkIndex++;

        console.log(`📦 Processing chunk ${chunkIndex} (${(text.length / 1024).toFixed(1)}KB)`);

        // Parse headers from first chunk
        if (!headersParsed && buffer.includes('\n')) {
          const firstLineEnd = buffer.indexOf('\n');
          const firstLine = buffer.substring(0, firstLineEnd);
          
          // Detect delimiter and parse headers
          delimiter = EnhancedCSVParser['detectDelimiter'](buffer);
          try {
            headers = EnhancedCSVParser['parseCSVLine'](firstLine, delimiter);
            headersParsed = true;
            console.log(`📋 Headers parsed: ${headers.length} columns detected with delimiter "${delimiter}"`);
          } catch (error) {
            errors.push({
              row: 1,
              type: 'format',
              severity: 'critical',
              message: `Failed to parse headers: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
            break;
          }
        }

        // Process complete lines from buffer
        const { completeLines, remainingBuffer } = this.processCompleteLines(buffer, delimiter);
        buffer = remainingBuffer;

        if (completeLines.length === 0) {
          updateProgress();
          continue;
        }

        // Parse lines (skip header line in first chunk)
        const dataLines = headersParsed && chunkIndex === 1 ? completeLines.slice(1) : completeLines;
        const chunkData: any[] = [];

        for (const [lineIndex, line] of dataLines.entries()) {
          const lineNumber = totalRowsProcessed + lineIndex + 2; // +2 for header and 1-based indexing
          
          if (line.trim() === '') {
            warnings.push(`Empty line ${lineNumber} skipped`);
            continue;
          }

          try {
            const values = EnhancedCSVParser['parseCSVLine'](line, delimiter);
            
            // Create row object
            const rowData: any = {};
            headers.forEach((header, index) => {
              const value = (values[index] || '').replace(/^"|"$/g, '').trim();
              rowData[header] = value;
            });

            chunkData.push(rowData);
            validRowsProcessed++;

          } catch (error) {
            errors.push({
              row: lineNumber,
              type: 'format',
              severity: 'warning',
              message: `Failed to parse row: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
          }
        }

        totalRowsProcessed += dataLines.length;

        // Process chunk data callback
        if (finalConfig.onChunkParsed && chunkData.length > 0) {
          try {
            await finalConfig.onChunkParsed(chunkData, chunkIndex);
            console.log(`✅ Chunk ${chunkIndex} processed: ${chunkData.length} records`);
          } catch (error) {
            console.error(`❌ Error processing chunk ${chunkIndex}:`, error);
            errors.push({
              row: 0,
              type: 'data',
              severity: 'critical',
              message: `Chunk processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
          }
        }

        // Clear chunk data from memory immediately
        chunkData.length = 0;

        updateProgress();

        // Yield control to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Process remaining buffer
      if (buffer.trim() !== '') {
        const { completeLines } = this.processCompleteLines(buffer + '\n', delimiter);
        totalRowsProcessed += completeLines.length;
        console.log(`📄 Processed remaining buffer: ${completeLines.length} lines`);
      }

    } catch (error) {
      console.error('💥 Streaming parse error:', error);
      errors.push({
        row: 0,
        type: 'data',
        severity: 'critical',
        message: `Streaming parse failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    const duration = Date.now() - startTime;
    const parseRate = totalRowsProcessed / (duration / 1000);
    const finalMemory = this.estimateMemoryUsage();
    const memoryPeak = Math.max(peakMemory - startMemory, finalMemory - startMemory);

    console.log(`🏁 Streaming parse completed in ${duration}ms. Rows: ${totalRowsProcessed}, Rate: ${parseRate.toFixed(1)} rps, Memory peak: ${(memoryPeak / 1024 / 1024).toFixed(1)}MB`);

    return {
      totalRows: totalRowsProcessed,
      validRows: validRowsProcessed,
      errors,
      warnings,
      headers,
      memoryPeak,
      duration,
      parseRate
    };
  }

  static async parseFileInChunks(
    file: File,
    onChunkReady: (chunk: any[]) => Promise<void>,
    onProgress?: (progress: StreamingProgress) => void
  ): Promise<StreamingParseResult> {
    return this.parseFileStream(file, {
      onChunkParsed: onChunkReady,
      onProgress
    });
  }

  static isLargeFile(file: File): boolean {
    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
    return file.size > LARGE_FILE_THRESHOLD;
  }

  static recommendChunkSize(fileSize: number): number {
    // Recommend chunk size based on file size
    if (fileSize < 10 * 1024 * 1024) return 1024 * 1024; // 1MB for small files
    if (fileSize < 100 * 1024 * 1024) return 2 * 1024 * 1024; // 2MB for medium files
    return 5 * 1024 * 1024; // 5MB for large files
  }
}