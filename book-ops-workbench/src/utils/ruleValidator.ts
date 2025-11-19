import { AssignmentRule } from '@/components/AdvancedRuleBuilder';

export interface ValidationError {
  type: 'error' | 'warning' | 'info';
  field: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validates assignment rules for conflicts, dependencies, and best practices
 */
export class RuleValidator {
  private rules: AssignmentRule[];

  constructor(rules: AssignmentRule[]) {
    this.rules = rules;
  }

  /**
   * Validates a single rule or all rules
   */
  validate(ruleToValidate?: AssignmentRule): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (ruleToValidate) {
      // Validate single rule
      this.validateSingleRule(ruleToValidate, errors, warnings);
    } else {
      // Validate all rules
      this.validateAllRules(errors, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateSingleRule(rule: AssignmentRule, errors: ValidationError[], warnings: ValidationError[]) {
    // Basic validation
    if (!rule.name || rule.name.trim() === '') {
      errors.push({
        type: 'error',
        field: 'name',
        message: 'Rule name is required'
      });
    }

    if (!rule.rule_type) {
      errors.push({
        type: 'error',
        field: 'rule_type',
        message: 'Rule type is required'
      });
    }

    if (rule.priority < 1) {
      errors.push({
        type: 'error',
        field: 'priority',
        message: 'Priority must be at least 1'
      });
    }

    // Conditional modifiers validation
    if (rule.conditional_modifiers && rule.conditional_modifiers.length > 0) {
      this.validateConditionalModifiers(rule, errors, warnings);
    }

    // Rule dependencies validation
    if (rule.rule_dependencies && rule.rule_dependencies.length > 0) {
      this.validateDependencies(rule, errors, warnings);
    }

    // Region capacity validation
    if (rule.region_capacity_config && Object.keys(rule.region_capacity_config).length > 0) {
      this.validateRegionCapacity(rule, errors, warnings);
    }

    // Rule-specific validation
    this.validateRuleSpecificConditions(rule, errors, warnings);
    
    // Required fields validation by rule type
    this.validateRequiredFields(rule, errors, warnings);
  }

  private validateRequiredFields(rule: AssignmentRule, errors: ValidationError[], warnings: ValidationError[]) {
    // GEO_FIRST requires territory mappings
    if (rule.rule_type === 'GEO_FIRST') {
      if (!rule.conditions?.territoryMappings || Object.keys(rule.conditions.territoryMappings).length === 0) {
        errors.push({
          type: 'error',
          field: 'conditions.territoryMappings',
          message: 'Geo rule requires territory mappings to be configured',
          suggestion: 'Go to Territory Mapping tab to configure country → territory assignments'
        });
      }
    }
    
    // CONTINUITY requires field mappings
    if (rule.rule_type === 'CONTINUITY') {
      if (!rule.conditions?.fieldMappings?.ownerIdField) {
        warnings.push({
          type: 'warning',
          field: 'conditions.fieldMappings.ownerIdField',
          message: 'Continuity rule missing field mapping',
          suggestion: 'Click "Configure Fields" to map the owner ID field'
        });
      }
    }
  }

  private validateAllRules(errors: ValidationError[], warnings: ValidationError[]) {
    // Check for circular dependencies
    this.checkCircularDependencies(errors);

    // Validate each rule individually
    this.rules.forEach(rule => {
      this.validateSingleRule(rule, errors, warnings);
    });
  }

  private validateConditionalModifiers(rule: AssignmentRule, errors: ValidationError[], warnings: ValidationError[]) {
    rule.conditional_modifiers?.forEach((modifier, index) => {
      // Validate condition syntax
      if (modifier.condition && typeof modifier.condition === 'string') {
        const validOperators = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'in'];
        const hasValidOperator = validOperators.some(op => modifier.condition.includes(op));
        
        if (!hasValidOperator) {
          errors.push({
            type: 'error',
            field: `conditional_modifiers[${index}].condition`,
            message: `Invalid condition syntax: "${modifier.condition}"`,
            suggestion: `Use operators: ${validOperators.join(', ')}`
          });
        }
      }

      // Validate action
      if (!modifier.action || !['add', 'multiply', 'set', 'boost'].includes(modifier.action)) {
        errors.push({
          type: 'error',
          field: `conditional_modifiers[${index}].action`,
          message: 'Invalid action type',
          suggestion: 'Use: add, multiply, set, or boost'
        });
      }

      // Validate value
      if (modifier.action !== 'set' && modifier.value === undefined) {
        errors.push({
          type: 'error',
          field: `conditional_modifiers[${index}].value`,
          message: 'Value is required for this action',
          suggestion: 'Provide a numeric value'
        });
      }
    });
  }

  private validateDependencies(rule: AssignmentRule, errors: ValidationError[], warnings: ValidationError[]) {
    rule.rule_dependencies?.forEach((depId, index) => {
      const dependsOn = this.rules.find(r => r.id === depId);
      
      if (!dependsOn) {
        errors.push({
          type: 'error',
          field: `rule_dependencies[${index}]`,
          message: `Dependency rule not found: ${depId}`,
          suggestion: 'Remove this dependency or create the missing rule'
        });
      } else if (dependsOn.priority >= rule.priority) {
        warnings.push({
          type: 'warning',
          field: `rule_dependencies[${index}]`,
          message: `Dependency "${dependsOn.name}" has equal or higher priority`,
          suggestion: 'Dependencies should be evaluated before dependent rules (lower priority number)'
        });
      }
    });
  }

  private validateRegionCapacity(rule: AssignmentRule, errors: ValidationError[], warnings: ValidationError[]) {
    Object.entries(rule.region_capacity_config || {}).forEach(([region, config]: [string, any]) => {
      if (config.maxTotalARR && config.maxAvgARR) {
        // Assuming ~5 reps per region (rough estimate)
        const estimatedReps = 5;
        const impliedTotal = config.maxAvgARR * estimatedReps;
        
        if (config.maxTotalARR < impliedTotal) {
          warnings.push({
            type: 'warning',
            field: `region_capacity_config.${region}`,
            message: `Max Total ARR (${config.maxTotalARR / 1000000}M) may be too low`,
            suggestion: `With ${estimatedReps} reps at ${config.maxAvgARR / 1000000}M avg, total should be ~${impliedTotal / 1000000}M+`
          });
        }
      }
    });
  }

  private validateRuleSpecificConditions(rule: AssignmentRule, errors: ValidationError[], warnings: ValidationError[]) {
    const conditions = rule.conditions || {};

    // Check if rule type is implemented in engine
    const implementedTypes = ['GEO_FIRST', 'CONTINUITY', 'SMART_BALANCE', 'CRE_BALANCE', 'TIER_BALANCE'];
    
    if (!implementedTypes.includes(rule.rule_type)) {
      errors.push({
        type: 'error',
        field: 'rule_type',
        message: `Rule type '${rule.rule_type}' is not implemented in the assignment engine and will be ignored`,
        suggestion: 'Only GEO_FIRST, CONTINUITY, SMART_BALANCE, CRE_BALANCE, and TIER_BALANCE are currently supported'
      });
    }

    switch (rule.rule_type) {
      case 'SMART_BALANCE':
        if (!conditions.minARRThreshold) {
          warnings.push({
            type: 'warning',
            field: 'conditions.minARRThreshold',
            message: 'Min ARR Threshold not set for Smart Balance',
            suggestion: 'Set a minimum threshold to ensure fair distribution'
          });
        }
        break;

      case 'CONTINUITY':
        if (!conditions.minimumOwnershipDays) {
          warnings.push({
            type: 'warning',
            field: 'conditions.minimumOwnershipDays',
            message: 'Minimum ownership days not set',
            suggestion: 'Set a threshold (e.g., 30 days) to qualify for continuity'
          });
        }
        break;
    }
  }

  private checkCircularDependencies(errors: ValidationError[]) {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (ruleId: string): boolean => {
      if (recursionStack.has(ruleId)) return true;
      if (visited.has(ruleId)) return false;

      visited.add(ruleId);
      recursionStack.add(ruleId);

      const rule = this.rules.find(r => r.id === ruleId);
      if (rule && rule.rule_dependencies) {
        for (const depId of rule.rule_dependencies) {
          if (hasCycle(depId)) return true;
        }
      }

      recursionStack.delete(ruleId);
      return false;
    };

    this.rules.forEach(rule => {
      if (rule.id && hasCycle(rule.id)) {
        errors.push({
          type: 'error',
          field: 'rule_dependencies',
          message: `Circular dependency detected involving rule "${rule.name}"`,
          suggestion: 'Remove circular dependencies to prevent infinite loops'
        });
      }
    });
  }
}

/**
 * Quick validation helper
 */
export const validateRules = (rules: AssignmentRule[], ruleToValidate?: AssignmentRule): ValidationResult => {
  const validator = new RuleValidator(rules);
  return validator.validate(ruleToValidate);
};
