// Enhanced CSV parser with robust error handling and data quality checks
import { toast } from '@/components/ui/use-toast';

export interface ParsedCSVResult {
  data: any[];
  headers: string[];
  errors: ParseError[];
  warnings: string[];
  totalRows: number;
  validRows: number;
  encoding: string;
  hasQuotedFields: boolean;
  delimiter: string;
}

export interface ParseError {
  row: number;
  column?: number;
  type: 'structural' | 'encoding' | 'data' | 'format';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestedFix?: string;
}

export interface DataQualityCheck {
  fieldName: string;
  emptyCount: number;
  uniqueCount: number;
  totalCount: number;
  dataTypes: { [key: string]: number };
  sampleValues: string[];
  possibleIssues: string[];
}

export class EnhancedCSVParser {
  private static detectDelimiter(csvText: string): string {
    const sample = csvText.substring(0, 2000);
    const delimiters = [',', ';', '\t', '|'];
    const counts = delimiters.map(delimiter => ({
      delimiter,
      count: (sample.match(new RegExp(`\\${delimiter}`, 'g')) || []).length
    }));
    
    // Find the delimiter with the most consistent occurrence across lines
    const lines = sample.split('\n').slice(0, 5);
    let bestDelimiter = ',';
    let bestConsistency = 0;
    
    for (const { delimiter } of counts) {
      const lineCounts = lines.map(line => (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length);
      const average = lineCounts.reduce((sum, count) => sum + count, 0) / lineCounts.length;
      const variance = lineCounts.reduce((sum, count) => sum + Math.pow(count - average, 2), 0) / lineCounts.length;
      const consistency = average > 0 ? average / (1 + variance) : 0;
      
      if (consistency > bestConsistency) {
        bestConsistency = consistency;
        bestDelimiter = delimiter;
      }
    }
    
    return bestDelimiter;
  }

  private static detectEncoding(csvText: string): string {
    // Simple encoding detection - can be enhanced with a proper library
    const hasUTF8BOM = csvText.charCodeAt(0) === 0xFEFF;
    if (hasUTF8BOM) return 'UTF-8 with BOM';
    
    // Check for common non-ASCII characters that indicate encoding issues
    const hasHighChars = /[\u0080-\u00FF]/.test(csvText);
    if (hasHighChars) return 'UTF-8 or Latin-1';
    
    return 'ASCII/UTF-8';
  }

  private static parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  static parseCSV(csvText: string, expectedHeaders?: string[]): ParsedCSVResult {
    const errors: ParseError[] = [];
    const warnings: string[] = [];
    const data: any[] = [];

    // Detect file characteristics
    const delimiter = this.detectDelimiter(csvText);
    const encoding = this.detectEncoding(csvText);
    const hasQuotedFields = csvText.includes('"');

    // Clean and split lines
    const cleanText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleanText.split('\n').filter(line => line.trim() !== '');

    if (lines.length === 0) {
      errors.push({
        row: 0,
        type: 'structural',
        severity: 'critical',
        message: 'File is empty or contains no valid data',
        suggestedFix: 'Ensure the file contains data and headers'
      });
      return {
        data: [],
        headers: [],
        errors,
        warnings,
        totalRows: 0,
        validRows: 0,
        encoding,
        hasQuotedFields,
        delimiter
      };
    }

    // Parse headers
    let headers: string[] = [];
    try {
      const rawHeaders = this.parseCSVLine(lines[0], delimiter).map(h => h.replace(/^"|"$/g, '').trim());

      // Filter out completely empty headers but preserve valid ones
      headers = rawHeaders.filter((h, index) => {
        if (!h || h.trim() === '' || typeof h !== 'string') {
          warnings.push(`Empty or invalid header found at column ${index + 1} - will be excluded from field mappings`);
          return false;
        }
        return true;
      });

      // Validate headers
      if (headers.length === 0) {
        errors.push({
          row: 1,
          type: 'structural',
          severity: 'critical',
          message: 'No valid headers found in the first row - all headers are empty or invalid',
          suggestedFix: 'Ensure the first row contains valid column names'
        });
      }

      if (rawHeaders.length > headers.length) {
        warnings.push(`Filtered out ${rawHeaders.length - headers.length} empty/invalid header(s) from ${rawHeaders.length} total columns`);
      }

      // Check for duplicate headers
      const headerCounts = headers.reduce((acc, header) => {
        acc[header] = (acc[header] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(headerCounts).forEach(([header, count]) => {
        if (count > 1) {
          warnings.push(`Duplicate header found: "${header}" appears ${count} times - this may cause field mapping issues`);
        }
      });

    } catch (error) {
      errors.push({
        row: 1,
        type: 'format',
        severity: 'critical',
        message: `Failed to parse headers: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return {
        data: [],
        headers: [],
        errors,
        warnings,
        totalRows: lines.length - 1,
        validRows: 0,
        encoding,
        hasQuotedFields,
        delimiter
      };
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const lineNumber = i + 1;
      const line = lines[i];

      if (line.trim() === '') {
        warnings.push(`Empty line ${lineNumber} skipped`);
        continue;
      }

      try {
        const values = this.parseCSVLine(line, delimiter);
        
        // Check column count consistency
        if (values.length !== headers.length) {
          const severity = Math.abs(values.length - headers.length) > headers.length * 0.5 ? 'critical' : 'warning';
          errors.push({
            row: lineNumber,
            type: 'structural',
            severity: severity as 'critical' | 'warning',
            message: `Column count mismatch: expected ${headers.length}, got ${values.length}`,
            suggestedFix: severity === 'critical' ? 'Check for missing delimiters or extra commas' : 'Row will be padded or truncated'
          });

          if (severity === 'critical') {
            continue;
          }
        }

        // Create row object, padding or truncating as needed
        const rowData: any = {};
        headers.forEach((header, index) => {
          let value = values[index] || '';
          
          // Clean value
          value = value.replace(/^"|"$/g, '').trim();
          
          rowData[header] = value;
        });

        data.push(rowData);

      } catch (error) {
        errors.push({
          row: lineNumber,
          type: 'format',
          severity: 'warning',
          message: `Failed to parse row: ${error instanceof Error ? error.message : 'Unknown error'}`,
          suggestedFix: 'Check for malformed quotes or special characters'
        });
      }
    }

    return {
      data,
      headers,
      errors,
      warnings,
      totalRows: lines.length - 1,
      validRows: data.length,
      encoding,
      hasQuotedFields,
      delimiter
    };
  }

  static analyzeDataQuality(data: any[]): DataQualityCheck[] {
    if (data.length === 0) return [];

    const headers = Object.keys(data[0]);
    return headers.map(fieldName => {
      const values = data.map(row => row[fieldName]).filter(val => val !== null && val !== undefined);
      const stringValues = values.map(val => String(val).trim()).filter(val => val !== '');
      
      const uniqueValues = new Set(stringValues);
      const emptyCount = data.length - stringValues.length;
      
      // Analyze data types
      const dataTypes: { [key: string]: number } = {};
      stringValues.forEach(value => {
        let type = 'string';
        if (/^\d+$/.test(value)) type = 'integer';
        else if (/^\d*\.\d+$/.test(value)) type = 'decimal';
        else if (/^\d{4}-\d{2}-\d{2}/.test(value)) type = 'date';
        else if (/^(true|false|yes|no|y|n)$/i.test(value)) type = 'boolean';
        else if (value.includes('@')) type = 'email';
        
        dataTypes[type] = (dataTypes[type] || 0) + 1;
      });

      // Identify possible issues
      const possibleIssues: string[] = [];
      const emptyPercentage = (emptyCount / data.length) * 100;
      
      if (emptyPercentage > 50) {
        possibleIssues.push(`High empty rate: ${emptyPercentage.toFixed(1)}%`);
      }
      
      if (uniqueValues.size === 1 && stringValues.length > 1) {
        possibleIssues.push('All values are identical');
      }
      
      if (Object.keys(dataTypes).length > 1) {
        possibleIssues.push('Mixed data types detected');
      }

      // Sample values for preview
      const sampleValues = Array.from(uniqueValues).slice(0, 5);

      return {
        fieldName,
        emptyCount,
        uniqueCount: uniqueValues.size,
        totalCount: data.length,
        dataTypes,
        sampleValues,
        possibleIssues
      };
    });
  }

  static generateParseReport(result: ParsedCSVResult, qualityChecks: DataQualityCheck[]): string {
    const lines: string[] = [];
    
    lines.push('=== CSV Parse Report ===');
    lines.push(`File Characteristics:`);
    lines.push(`- Delimiter: "${result.delimiter}"`);
    lines.push(`- Encoding: ${result.encoding}`);
    lines.push(`- Has quoted fields: ${result.hasQuotedFields ? 'Yes' : 'No'}`);
    lines.push(`- Total rows: ${result.totalRows}`);
    lines.push(`- Valid rows: ${result.validRows}`);
    lines.push(`- Headers: ${result.headers.length}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push('Errors:');
      result.errors.forEach(error => {
        lines.push(`- Row ${error.row}: [${error.severity.toUpperCase()}] ${error.message}`);
        if (error.suggestedFix) {
          lines.push(`  Fix: ${error.suggestedFix}`);
        }
      });
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      result.warnings.forEach(warning => lines.push(`- ${warning}`));
      lines.push('');
    }

    if (qualityChecks.length > 0) {
      lines.push('Data Quality Analysis:');
      qualityChecks.forEach(check => {
        lines.push(`- ${check.fieldName}:`);
        lines.push(`  Empty: ${check.emptyCount}/${check.totalCount} (${((check.emptyCount/check.totalCount)*100).toFixed(1)}%)`);
        lines.push(`  Unique values: ${check.uniqueCount}`);
        if (check.possibleIssues.length > 0) {
          lines.push(`  Issues: ${check.possibleIssues.join(', ')}`);
        }
      });
    }

    return lines.join('\n');
  }
}