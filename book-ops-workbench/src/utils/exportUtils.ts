// Export utility functions for generating actual downloadable files

export interface SalesforceUploadRow {
  AccountId: string;
  OwnerId: string;
  Owner_Name: string;
  Territory: string;
  Effective_Date: string;
}

export interface RepSheetData {
  rep_name: string;
  rep_id: string;
  team: string;
  region: string;
  customers: CustomerAccount[];
  prospects: ProspectAccount[];
}

export interface CustomerAccount {
  account_name: string;
  account_id: string;
  arr: number;
  atr: number;
  renewal_date: string;
  risk_level: string;
}

export interface ProspectAccount {
  account_name: string;
  account_id: string;
  tier: string;
  employees: number;
}

export interface HoldoverRecord {
  account_id: string;
  account_name: string;
  old_owner: string;
  new_owner: string;
  opportunity_ids: string[];
  stages: string[];
  close_dates: string[];
  effective_transfer_date: string;
}

// Generate CSV content for Salesforce upload
export const generateSalesforceCSV = (data: SalesforceUploadRow[]): string => {
  const headers = ['AccountId', 'OwnerId', 'Owner_Name', 'Territory', 'Effective_Date'];
  const csvContent = [
    headers.join(','),
    ...data.map(row => [
      row.AccountId,
      row.OwnerId,
      `"${row.Owner_Name}"`,
      `"${row.Territory}"`,
      row.Effective_Date
    ].join(','))
  ].join('\n');
  
  return csvContent;
};

// Generate Excel-compatible CSV for rep sheets
export const generateRepSheetCSV = (repData: RepSheetData): string => {
  const lines: string[] = [];
  
  // Rep header information
  lines.push(`Rep Name,${repData.rep_name}`);
  lines.push(`Rep ID,${repData.rep_id}`);
  lines.push(`Team,${repData.team}`);
  lines.push(`Region,${repData.region}`);
  lines.push(''); // Empty line
  
  // Customer accounts section
  lines.push('CUSTOMER ACCOUNTS');
  lines.push('Account Name,Account ID,ARR,ATR,Renewal Date,Risk Level');
  repData.customers.forEach(customer => {
    lines.push([
      `"${customer.account_name}"`,
      customer.account_id,
      customer.arr.toString(),
      customer.atr.toString(),
      customer.renewal_date,
      customer.risk_level
    ].join(','));
  });
  
  lines.push(''); // Empty line
  
  // Prospect accounts section
  lines.push('PROSPECT ACCOUNTS');
  lines.push('Account Name,Account ID,Tier,Employees');
  repData.prospects.forEach(prospect => {
    lines.push([
      `"${prospect.account_name}"`,
      prospect.account_id,
      prospect.tier,
      prospect.employees.toString()
    ].join(','));
  });
  
  return lines.join('\n');
};

// Generate holdover report CSV
export const generateHoldoverCSV = (data: HoldoverRecord[]): string => {
  const headers = ['Account ID', 'Account Name', 'Old Owner', 'New Owner', 'Opportunity IDs', 'Stages', 'Close Dates', 'Effective Transfer Date'];
  const csvContent = [
    headers.join(','),
    ...data.map(row => [
      row.account_id,
      `"${row.account_name}"`,
      `"${row.old_owner}"`,
      `"${row.new_owner}"`,
      `"${row.opportunity_ids.join('; ')}"`,
      `"${row.stages.join('; ')}"`,
      `"${row.close_dates.join('; ')}"`,
      row.effective_transfer_date
    ].join(','))
  ].join('\n');
  
  return csvContent;
};

// Download a file with given content
export const downloadFile = (content: string, filename: string, mimeType: string = 'text/csv') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Create a zip-like package (simulated with multiple downloads)
export const downloadPackage = (files: { name: string; content: string; type?: string }[]) => {
  files.forEach((file, index) => {
    setTimeout(() => {
      downloadFile(file.content, file.name, file.type);
    }, index * 500); // Stagger downloads to avoid browser blocking
  });
};

// Mock data generators for demo purposes
export const generateMockSalesforceData = (): SalesforceUploadRow[] => {
  return [
    {
      AccountId: 'ACC001234',
      OwnerId: 'USR001',
      Owner_Name: 'John Smith',
      Territory: 'Enterprise AMER',
      Effective_Date: '2024-02-01'
    },
    {
      AccountId: 'ACC005678',
      OwnerId: 'USR002',
      Owner_Name: 'Sarah Johnson',
      Territory: 'Enterprise EMEA',
      Effective_Date: '2024-02-01'
    },
    {
      AccountId: 'ACC009012',
      OwnerId: 'USR003',
      Owner_Name: 'Mike Wilson',
      Territory: 'Commercial AMER',
      Effective_Date: '2024-02-01'
    }
  ];
};

export const generateMockRepData = (): RepSheetData => {
  return {
    rep_name: 'John Smith',
    rep_id: 'USR001',
    team: 'Enterprise AMER',
    region: 'AMER',
    customers: [
      {
        account_name: 'Global Enterprise Corp',
        account_id: 'ACC001234',
        arr: 850000,
        atr: 680000,
        renewal_date: '2024-06-15',
        risk_level: 'Low'
      },
      {
        account_name: 'Tech Solutions Ltd',
        account_id: 'ACC001235',
        arr: 420000,
        atr: 350000,
        renewal_date: '2024-09-30',
        risk_level: 'Medium'
      }
    ],
    prospects: [
      {
        account_name: 'Startup Innovations',
        account_id: 'ACC001236',
        tier: 'Tier 1',
        employees: 250
      },
      {
        account_name: 'Growth Company Inc',
        account_id: 'ACC001237',
        tier: 'Tier 2',
        employees: 150
      }
    ]
  };
};

export const generateMockHoldoverData = (): HoldoverRecord[] => {
  return [
    {
      account_id: 'ACC001234',
      account_name: 'Global Enterprise Corp',
      old_owner: 'Previous Rep',
      new_owner: 'John Smith',
      opportunity_ids: ['OPP001', 'OPP002'],
      stages: ['Negotiation', 'Proposal'],
      close_dates: ['2024-03-15', '2024-04-30'],
      effective_transfer_date: '2024-02-01'
    },
    {
      account_id: 'ACC005678',
      account_name: 'Tech Solutions Ltd',
      old_owner: 'Another Rep',
      new_owner: 'Sarah Johnson',
      opportunity_ids: ['OPP003'],
      stages: ['Discovery'],
      close_dates: ['2024-05-15'],
      effective_transfer_date: '2024-02-01'
    }
  ];
};