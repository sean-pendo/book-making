import { supabase } from '@/integrations/supabase/client';

export interface AssignmentExportData {
  account_id: string;
  account_name: string;
  hq_location: string;
  tier: string;
  arr: number;
  current_owner_id: string;
  current_owner_name: string;
  new_owner_id: string;
  new_owner_name: string;
  assignment_reasoning: string;
  risk_level: string;
  assignment_status: string;
  reassigned_flag: boolean;
  assignment_type: 'customer' | 'prospect';
  geo?: string;
  sales_territory?: string;
}

export interface ExportSummary {
  totalAccounts: number;
  customerAccounts: number;
  prospectAccounts: number;
  assignedAccounts: number;
  unassignedAccounts: number;
  exportDate: string;
  buildId: string;
}

/**
 * Fetch assignment data for export with reasoning from assignments table
 */
export const fetchAssignmentExportData = async (
  buildId: string,
  accountType: 'customers' | 'prospects' | 'all' = 'all'
): Promise<{ data: AssignmentExportData[]; summary: ExportSummary }> => {
  try {
    console.log(`[AssignmentExport] Fetching ${accountType} assignment data for build ${buildId}`);

    // Fetch accounts with assignment data
    let accountQuery = supabase
      .from('accounts')
      .select(`
        sfdc_account_id,
        account_name,
        owner_id,
        owner_name,
        new_owner_id,
        new_owner_name,
        is_customer,
        is_parent,
        enterprise_vs_commercial,
        expansion_tier,
        initial_sale_tier,
        arr,
        calculated_arr,
        hierarchy_bookings_arr_converted,
        geo,
        hq_country,
        sales_territory,
        risk_flag,
        cre_risk,
        cre_count
      `)
      .eq('build_id', buildId)
      .eq('is_parent', true);

    // Filter by account type if specified
    if (accountType === 'customers') {
      accountQuery = accountQuery.eq('is_customer', true);
    } else if (accountType === 'prospects') {
      accountQuery = accountQuery.eq('is_customer', false);
    }

    const { data: accounts, error: accountsError } = await accountQuery;
    if (accountsError) throw accountsError;

    // Fetch assignment reasoning from assignments table
    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('sfdc_account_id, rationale, assignment_type')
      .eq('build_id', buildId);

    if (assignmentsError) {
      console.warn('[AssignmentExport] Warning fetching assignments:', assignmentsError);
    }

    // Create assignment reasoning map
    const reasoningMap = new Map<string, { rationale: string; assignment_type: string }>();
    assignments?.forEach(assignment => {
      reasoningMap.set(assignment.sfdc_account_id, {
        rationale: assignment.rationale || '',
        assignment_type: assignment.assignment_type || ''
      });
    });

    // Helper function to determine assignment status (matches UI logic exactly)
    const getAssignmentStatus = (account: any): string => {
      // Check if there's a proposed assignment (new_owner_id exists)
      if (account.new_owner_id && account.new_owner_id !== account.owner_id) {
        return 'Proposed Assignment';
      }
      // Check if account has no current owner
      if (!account.owner_id) {
        return 'Not Assigned';
      }
      // Account has a current owner
      return 'Assigned';
    };

    // Helper function to determine reassigned flag
    const getReassignedFlag = (account: any): boolean => {
      return !!(account.new_owner_id && account.owner_id && account.new_owner_id !== account.owner_id);
    };

    // Helper function to get HQ location (matches UI logic)
    const getHQLocation = (account: any): string => {
      return account.sales_territory || account.hq_country || account.geo || 'N/A';
    };

    // Enhanced risk calculation using CRE count (matches UI logic exactly)
    const calculateRiskLevel = (account: any): string => {
      const creCount = account.cre_count || 0;
      
      if (creCount === 0) return 'No Risk';
      if (creCount <= 2) return 'Medium Risk';
      return 'High Risk';
    };

    // Helper function to detect Sales Tools bucket accounts
    const isSalesToolsAccount = (rationale: string | undefined): boolean => {
      return rationale?.includes('Routed to Sales Tools') ?? false;
    };

    // Transform data for export
    const exportData: AssignmentExportData[] = accounts?.map(account => {
      const assignmentData = reasoningMap.get(account.sfdc_account_id);
      const tier = account.expansion_tier 
        ? `Expansion ${account.expansion_tier}`
        : account.initial_sale_tier 
        ? `Initial ${account.initial_sale_tier}`
        : account.enterprise_vs_commercial || 'N/A';

      const arr = account.hierarchy_bookings_arr_converted || account.calculated_arr || account.arr || 0;

      // Handle Sales Tools labeling - show "Sales Tools" instead of empty/unassigned
      const isSalesTools = isSalesToolsAccount(assignmentData?.rationale);
      const newOwnerName = isSalesTools ? 'Sales Tools' : (account.new_owner_name || '');
      const newOwnerId = isSalesTools ? '' : (account.new_owner_id || '');

      return {
        account_id: account.sfdc_account_id,
        account_name: account.account_name,
        hq_location: getHQLocation(account),
        tier,
        arr,
        current_owner_id: account.owner_id || '',
        current_owner_name: account.owner_name || '',
        new_owner_id: newOwnerId,
        new_owner_name: newOwnerName,
        assignment_reasoning: assignmentData?.rationale || '',
        risk_level: calculateRiskLevel(account),
        assignment_status: getAssignmentStatus(account),
        reassigned_flag: getReassignedFlag(account),
        assignment_type: account.is_customer ? 'customer' : 'prospect',
        geo: account.geo,
        sales_territory: account.sales_territory
      };
    }) || [];

    // Calculate summary statistics
    const totalAccounts = exportData.length;
    const customerAccounts = exportData.filter(a => a.assignment_type === 'customer').length;
    const prospectAccounts = exportData.filter(a => a.assignment_type === 'prospect').length;
    const assignedAccounts = exportData.filter(a => a.new_owner_id || a.current_owner_id).length;
    const unassignedAccounts = totalAccounts - assignedAccounts;

    const summary: ExportSummary = {
      totalAccounts,
      customerAccounts,
      prospectAccounts,
      assignedAccounts,
      unassignedAccounts,
      exportDate: new Date().toISOString(),
      buildId
    };

    console.log(`[AssignmentExport] Successfully prepared export data:`, summary);

    return { data: exportData, summary };

  } catch (error) {
    console.error('[AssignmentExport] Error fetching assignment data:', error);
    throw error;
  }
};

/**
 * Generate CSV content for assignment export
 */
export const generateAssignmentCSV = (data: AssignmentExportData[], summary: ExportSummary): string => {
  const lines: string[] = [];
  
  // Add summary header
  lines.push('ASSIGNMENT EXPORT SUMMARY');
  lines.push(`Export Date,${new Date(summary.exportDate).toLocaleDateString()}`);
  lines.push(`Build ID,${summary.buildId}`);
  lines.push(`Total Accounts,${summary.totalAccounts}`);
  lines.push(`Customer Accounts,${summary.customerAccounts}`);
  lines.push(`Prospect Accounts,${summary.prospectAccounts}`);
  lines.push(`Assigned Accounts,${summary.assignedAccounts}`);
  lines.push(`Unassigned Accounts,${summary.unassignedAccounts}`);
  lines.push(''); // Empty line

  // Add column headers (matches UI order exactly)
  const headers = [
    'Account Name',
    'Account ID',
    'HQ Location',
    'Tier', 
    'ARR',
    'Current Owner Name',
    'Current Owner ID',
    'New Owner Name',
    'New Owner ID',
    'Reasoning',
    'Risk Level',
    'Assignment Status',
    'Reassigned Flag',
    'Account Type',
    'Geography',
    'Sales Territory'
  ];
  
  lines.push(headers.join(','));

  // Add data rows
  data.forEach(account => {
    const row = [
      `"${account.account_name}"`,
      account.account_id,
      `"${account.hq_location}"`,
      `"${account.tier}"`,
      account.arr?.toString() || '0',
      `"${account.current_owner_name}"`,
      account.current_owner_id,
      `"${account.new_owner_name}"`,
      account.new_owner_id,
      `"${account.assignment_reasoning}"`,
      `"${account.risk_level}"`,
      `"${account.assignment_status}"`,
      account.reassigned_flag ? 'Yes' : 'No',
      account.assignment_type,
      `"${account.geo || ''}"`,
      `"${account.sales_territory || ''}"`
    ];
    lines.push(row.join(','));
  });

  return lines.join('\n');
};

/**
 * Download assignment export file
 */
export const downloadAssignmentExport = (
  data: AssignmentExportData[], 
  summary: ExportSummary, 
  accountType: string = 'all'
): void => {
  const csvContent = generateAssignmentCSV(data, summary);
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `assignment_export_${accountType}_${timestamp}.csv`;
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};