import { AccountDetail } from '@/hooks/useEnhancedBalancing';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates parent-child relationship operations
 */
export const validateParentChildOperation = (
  operation: 'break-apart' | 'change-parent',
  childAccount: AccountDetail,
  newParentAccount?: AccountDetail
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Common validations
  if (!childAccount) {
    errors.push('Child account is required');
    return { isValid: false, errors, warnings };
  }

  // Validate break-apart operation
  if (operation === 'break-apart') {
    if (!childAccount.ultimate_parent_id) {
      errors.push('Account is already independent (no parent relationship)');
    }
    
    // Warning if child has significant ARR
    if (childAccount.arr && childAccount.arr > 100000) {
      warnings.push(`This account has significant ARR (${formatCurrency(childAccount.arr)}). Breaking apart may impact parent metrics significantly.`);
    }
  }

  // Validate change-parent operation
  if (operation === 'change-parent') {
    if (!newParentAccount) {
      errors.push('New parent account is required');
      return { isValid: false, errors, warnings };
    }

    // Prevent circular reference
    if (newParentAccount.sfdc_account_id === childAccount.sfdc_account_id) {
      errors.push('An account cannot be its own parent');
    }

    // Ensure new parent is actually a parent account
    if (newParentAccount.ultimate_parent_id && newParentAccount.ultimate_parent_id !== '') {
      errors.push('Selected account is not a parent account. Only parent accounts can have children.');
    }

    // Warning if moving between different regions
    if (childAccount.sales_territory && newParentAccount.sales_territory &&
        childAccount.sales_territory !== newParentAccount.sales_territory) {
      warnings.push(`Child is in ${childAccount.sales_territory} but new parent is in ${newParentAccount.sales_territory}. This may affect regional alignment.`);
    }

    // Warning if new parent is a prospect but child is a customer
    if (childAccount.is_customer && !newParentAccount.is_customer) {
      warnings.push('Moving a customer child to a prospect parent. This may affect customer/prospect classification.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validates bulk parent-child operations
 */
export const validateBulkOperation = (
  operation: 'break-apart' | 'change-parent',
  childAccounts: AccountDetail[],
  newParentAccount?: AccountDetail
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (childAccounts.length === 0) {
    errors.push('No accounts selected');
    return { isValid: false, errors, warnings };
  }

  // Validate each account
  const validationResults = childAccounts.map(account => 
    validateParentChildOperation(operation, account, newParentAccount)
  );

  // Aggregate errors and warnings
  validationResults.forEach((result, index) => {
    if (!result.isValid) {
      errors.push(`${childAccounts[index].account_name}: ${result.errors.join(', ')}`);
    }
    if (result.warnings.length > 0) {
      warnings.push(...result.warnings.map(w => `${childAccounts[index].account_name}: ${w}`));
    }
  });

  // Additional bulk operation warnings
  if (childAccounts.length > 10) {
    warnings.push(`You are modifying ${childAccounts.length} accounts at once. This may take some time to process.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Checks if an account can be assigned as a parent
 */
export const canBeParent = (account: AccountDetail): boolean => {
  // An account can be a parent if it doesn't have a parent itself
  return !account.ultimate_parent_id || account.ultimate_parent_id === '';
};

/**
 * Checks if an account is a child
 */
export const isChild = (account: AccountDetail): boolean => {
  return !!(account.ultimate_parent_id && account.ultimate_parent_id !== '');
};

/**
 * Gets the impact description for a parent-child operation
 */
export const getOperationImpact = (
  operation: 'break-apart' | 'change-parent',
  childAccount: AccountDetail,
  newParentAccount?: AccountDetail
): string => {
  if (operation === 'break-apart') {
    return `Breaking apart will:
    • Make ${childAccount.account_name} an independent parent account
    • Remove it from its current parent's hierarchy
    • Recalculate the old parent's ARR, ATR, and CRE metrics
    • Update customer/prospect classification`;
  }

  if (operation === 'change-parent' && newParentAccount) {
    return `Changing parent will:
    • Move ${childAccount.account_name} from its current parent to ${newParentAccount.account_name}
    • Recalculate both old and new parent's ARR, ATR, and CRE metrics
    • Update hierarchy-based customer/prospect classification
    • Maintain the child's own owner assignment`;
  }

  return '';
};

// Helper function
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
