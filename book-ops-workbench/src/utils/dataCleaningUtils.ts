// Data cleaning and standardization utilities
export interface CleaningRule {
  field: string;
  type: 'standardize' | 'format' | 'validate' | 'transform';
  rule: string;
  description: string;
  examples?: string[];
}

export interface CleaningResult {
  originalValue: any;
  cleanedValue: any;
  applied: boolean;
  rule: string;
  confidence: number;
}

export class DataCleaner {
  private static countryMappings = new Map([
    // Common country name variations
    ['usa', 'United States'],
    ['united states of america', 'United States'],
    ['us', 'United States'],
    ['america', 'United States'],
    ['uk', 'United Kingdom'],
    ['great britain', 'United Kingdom'],
    ['england', 'United Kingdom'],
    ['britain', 'United Kingdom'],
    ['deutschland', 'Germany'],
    ['brasil', 'Brazil'],
    ['espana', 'Spain'],
    ['france', 'France'],
    ['italia', 'Italy'],
    ['japan', 'Japan'],
    ['nippon', 'Japan'],
    ['china', 'China'],
    ['prc', 'China'],
    ['peoples republic of china', 'China'],
    ['russia', 'Russia'],
    ['russian federation', 'Russia'],
    ['canada', 'Canada'],
    ['australia', 'Australia'],
    ['india', 'India'],
    ['south korea', 'South Korea'],
    ['korea', 'South Korea'],
    ['netherlands', 'Netherlands'],
    ['holland', 'Netherlands'],
    ['switzerland', 'Switzerland'],
    ['schweiz', 'Switzerland'],
    ['sweden', 'Sweden'],
    ['norway', 'Norway'],
    ['denmark', 'Denmark'],
    ['finland', 'Finland'],
    ['belgium', 'Belgium'],
    ['austria', 'Austria'],
    ['poland', 'Poland'],
    ['czech republic', 'Czech Republic'],
    ['czechia', 'Czech Republic'],
  ]);

  private static phoneRegex = /^[\+]?[1-9][\d\s\-\(\)\.]{7,15}$/;
  private static emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private static zipCodePatterns = new Map([
    ['US', /^\d{5}(-\d{4})?$/],
    ['CA', /^[A-Z]\d[A-Z] \d[A-Z]\d$/],
    ['UK', /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/],
    ['DE', /^\d{5}$/],
    ['FR', /^\d{5}$/],
  ]);

  static cleanCountryName(value: string): CleaningResult {
    if (!value || typeof value !== 'string') {
      return {
        originalValue: value,
        cleanedValue: value,
        applied: false,
        rule: 'country_standardization',
        confidence: 0
      };
    }

    const normalized = value.toLowerCase().trim();
    const standardized = this.countryMappings.get(normalized);

    if (standardized) {
      return {
        originalValue: value,
        cleanedValue: standardized,
        applied: true,
        rule: 'country_standardization',
        confidence: 0.95
      };
    }

    // Partial matching for fuzzy country names
    for (const [key, standardName] of this.countryMappings.entries()) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return {
          originalValue: value,
          cleanedValue: standardName,
          applied: true,
          rule: 'country_partial_match',
          confidence: 0.75
        };
      }
    }

    // Basic capitalization fix
    const capitalized = value.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    if (capitalized !== value) {
      return {
        originalValue: value,
        cleanedValue: capitalized,
        applied: true,
        rule: 'country_capitalization',
        confidence: 0.8
      };
    }

    return {
      originalValue: value,
      cleanedValue: value,
      applied: false,
      rule: 'country_standardization',
      confidence: 1.0
    };
  }

  static cleanPhoneNumber(value: string): CleaningResult {
    if (!value || typeof value !== 'string') {
      return {
        originalValue: value,
        cleanedValue: value,
        applied: false,
        rule: 'phone_formatting',
        confidence: 0
      };
    }

    // Remove all non-digit characters except +
    const digitsOnly = value.replace(/[^\d+]/g, '');
    
    // Basic phone number validation and formatting
    if (this.phoneRegex.test(value)) {
      // Already well formatted
      return {
        originalValue: value,
        cleanedValue: value,
        applied: false,
        rule: 'phone_formatting',
        confidence: 1.0
      };
    }

    // Try to format US numbers
    if (digitsOnly.length === 10) {
      const formatted = `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
      return {
        originalValue: value,
        cleanedValue: formatted,
        applied: true,
        rule: 'phone_us_formatting',
        confidence: 0.9
      };
    }

    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
      const formatted = `+1 (${digitsOnly.slice(1, 4)}) ${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`;
      return {
        originalValue: value,
        cleanedValue: formatted,
        applied: true,
        rule: 'phone_us_international',
        confidence: 0.9
      };
    }

    return {
      originalValue: value,
      cleanedValue: digitsOnly,
      applied: digitsOnly !== value,
      rule: 'phone_digits_only',
      confidence: 0.6
    };
  }

  static cleanEmail(value: string): CleaningResult {
    if (!value || typeof value !== 'string') {
      return {
        originalValue: value,
        cleanedValue: value,
        applied: false,
        rule: 'email_validation',
        confidence: 0
      };
    }

    const trimmed = value.trim().toLowerCase();

    if (this.emailRegex.test(trimmed)) {
      return {
        originalValue: value,
        cleanedValue: trimmed,
        applied: trimmed !== value,
        rule: 'email_normalization',
        confidence: 1.0
      };
    }

    return {
      originalValue: value,
      cleanedValue: value,
      applied: false,
      rule: 'email_validation',
      confidence: 0
    };
  }

  static cleanNumericValue(value: any, field: string): CleaningResult {
    if (value === null || value === undefined || value === '') {
      return {
        originalValue: value,
        cleanedValue: null,
        applied: false,
        rule: 'numeric_null_handling',
        confidence: 1.0
      };
    }

    if (typeof value === 'number') {
      return {
        originalValue: value,
        cleanedValue: value,
        applied: false,
        rule: 'numeric_validation',
        confidence: 1.0
      };
    }

    const stringValue = String(value).trim();
    
    // Handle currency symbols and formatting
    const cleaned = stringValue
      .replace(/[$€£¥,\s]/g, '') // Remove currency symbols and separators
      .replace(/[()]/g, '') // Remove parentheses
      .replace(/^-/, ''); // Handle negative numbers

    const numericValue = parseFloat(cleaned);

    if (!isNaN(numericValue)) {
      // Handle negative values in parentheses
      const isNegative = stringValue.includes('(') && stringValue.includes(')');
      const finalValue = isNegative ? -Math.abs(numericValue) : numericValue;

      return {
        originalValue: value,
        cleanedValue: finalValue,
        applied: finalValue !== value,
        rule: field.toLowerCase().includes('amount') || field.toLowerCase().includes('revenue') ? 
              'currency_formatting' : 'numeric_parsing',
        confidence: 0.95
      };
    }

    // Handle percentage values
    if (stringValue.includes('%')) {
      const percentValue = parseFloat(stringValue.replace('%', ''));
      if (!isNaN(percentValue)) {
        return {
          originalValue: value,
          cleanedValue: percentValue / 100,
          applied: true,
          rule: 'percentage_conversion',
          confidence: 0.9
        };
      }
    }

    return {
      originalValue: value,
      cleanedValue: value,
      applied: false,
      rule: 'numeric_validation',
      confidence: 0
    };
  }

  static cleanDateValue(value: any): CleaningResult {
    if (!value) {
      return {
        originalValue: value,
        cleanedValue: null,
        applied: false,
        rule: 'date_null_handling',
        confidence: 1.0
      };
    }

    const stringValue = String(value).trim();
    
    // Try parsing the date
    const parsed = new Date(stringValue);
    
    if (!isNaN(parsed.getTime())) {
      // Format as YYYY-MM-DD for consistency
      const formatted = parsed.toISOString().split('T')[0];
      return {
        originalValue: value,
        cleanedValue: formatted,
        applied: formatted !== stringValue,
        rule: 'date_standardization',
        confidence: 0.9
      };
    }

    // Try common date formats
    const dateFormats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY or DD/MM/YYYY
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // MM-DD-YYYY or DD-MM-YYYY
    ];

    for (const format of dateFormats) {
      const match = stringValue.match(format);
      if (match) {
        try {
          const [, part1, part2, part3] = match;
          // Assume YYYY-MM-DD or MM/DD/YYYY format
          const year = part3.length === 4 ? parseInt(part3) : parseInt(part1);
          const month = part3.length === 4 ? parseInt(part1) - 1 : parseInt(part2) - 1;
          const day = part3.length === 4 ? parseInt(part2) : parseInt(part3);
          
          const date = new Date(year, month, day);
          if (!isNaN(date.getTime())) {
            const formatted = date.toISOString().split('T')[0];
            return {
              originalValue: value,
              cleanedValue: formatted,
              applied: true,
              rule: 'date_format_parsing',
              confidence: 0.8
            };
          }
        } catch {
          // Continue to next format
        }
      }
    }

    return {
      originalValue: value,
      cleanedValue: value,
      applied: false,
      rule: 'date_validation',
      confidence: 0
    };
  }

  static cleanBooleanValue(value: any): CleaningResult {
    if (typeof value === 'boolean') {
      return {
        originalValue: value,
        cleanedValue: value,
        applied: false,
        rule: 'boolean_validation',
        confidence: 1.0
      };
    }

    if (!value) {
      return {
        originalValue: value,
        cleanedValue: false,
        applied: true,
        rule: 'boolean_null_to_false',
        confidence: 0.9
      };
    }

    const stringValue = String(value).toLowerCase().trim();
    const trueValues = ['true', 'yes', 'y', '1', 'on', 'enabled', 'active'];
    const falseValues = ['false', 'no', 'n', '0', 'off', 'disabled', 'inactive'];

    if (trueValues.includes(stringValue)) {
      return {
        originalValue: value,
        cleanedValue: true,
        applied: true,
        rule: 'boolean_string_to_true',
        confidence: 0.95
      };
    }

    if (falseValues.includes(stringValue)) {
      return {
        originalValue: value,
        cleanedValue: false,
        applied: true,
        rule: 'boolean_string_to_false',
        confidence: 0.95
      };
    }

    return {
      originalValue: value,
      cleanedValue: value,
      applied: false,
      rule: 'boolean_validation',
      confidence: 0
    };
  }

  static applyFieldCleaning(data: any[], fieldName: string, fieldType: string): {
    cleanedData: any[];
    cleaningResults: CleaningResult[];
    summary: {
      totalProcessed: number;
      successfulCleanings: number;
      cleaningRate: number;
      highConfidenceCleanings: number;
    };
  } {
    const cleaningResults: CleaningResult[] = [];
    const cleanedData = data.map((row, index) => {
      const value = row[fieldName];
      let result: CleaningResult;

      switch (fieldType) {
        case 'country':
          result = this.cleanCountryName(value);
          break;
        case 'phone':
          result = this.cleanPhoneNumber(value);
          break;
        case 'email':
          result = this.cleanEmail(value);
          break;
        case 'numeric':
        case 'currency':
        case 'amount':
          result = this.cleanNumericValue(value, fieldName);
          break;
        case 'date':
          result = this.cleanDateValue(value);
          break;
        case 'boolean':
          result = this.cleanBooleanValue(value);
          break;
        default:
          result = {
            originalValue: value,
            cleanedValue: value,
            applied: false,
            rule: 'no_cleaning_applied',
            confidence: 1.0
          };
      }

      cleaningResults.push(result);
      return {
        ...row,
        [fieldName]: result.cleanedValue
      };
    });

    const successfulCleanings = cleaningResults.filter(r => r.applied).length;
    const highConfidenceCleanings = cleaningResults.filter(r => r.confidence >= 0.9).length;

    return {
      cleanedData,
      cleaningResults,
      summary: {
        totalProcessed: data.length,
        successfulCleanings,
        cleaningRate: (successfulCleanings / data.length) * 100,
        highConfidenceCleanings
      }
    };
  }

  static getAvailableCleaningRules(): CleaningRule[] {
    return [
      {
        field: 'country',
        type: 'standardize',
        rule: 'country_standardization',
        description: 'Standardize country names to common formats',
        examples: ['USA → United States', 'UK → United Kingdom', 'deutschland → Germany']
      },
      {
        field: 'phone',
        type: 'format',
        rule: 'phone_formatting',
        description: 'Format phone numbers consistently',
        examples: ['1234567890 → (123) 456-7890', '11234567890 → +1 (123) 456-7890']
      },
      {
        field: 'email',
        type: 'validate',
        rule: 'email_normalization',
        description: 'Normalize email addresses',
        examples: ['USER@DOMAIN.COM → user@domain.com']
      },
      {
        field: 'amount',
        type: 'transform',
        rule: 'currency_formatting',
        description: 'Clean currency values',
        examples: ['$1,234.56 → 1234.56', '(500) → -500']
      },
      {
        field: 'date',
        type: 'standardize',
        rule: 'date_standardization',
        description: 'Standardize date formats',
        examples: ['12/31/2023 → 2023-12-31', '31-12-2023 → 2023-12-31']
      },
      {
        field: 'boolean',
        type: 'transform',
        rule: 'boolean_conversion',
        description: 'Convert text to boolean values',
        examples: ['Yes → true', 'N → false', '1 → true']
      }
    ];
  }
}