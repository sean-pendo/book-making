import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Check, AlertTriangle, X, FileText, Database, Settings, Download, Plus, Shield, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  parseCSV, 
  validateAccountData, 
  validateOpportunityData,
  importAccountsToDatabase,
  importOpportunitiesToDatabase,
  importSalesRepsToDatabase,
  generateSampleAccountsCSV,
  generateSampleOpportunitiesCSV,
  generateSampleSalesRepsCSV,
  validateMappedData,
  ValidationSummary,
  AccountImportRow,
  OpportunityImportRow,
  SalesRepImportRow,
  ImportResult
} from '@/utils/importUtils';
import { 
  autoMapFields, 
  convertToFieldMappings, 
  getAutoMappingSummary,
  ACCOUNT_FIELD_ALIASES,
  OPPORTUNITY_FIELD_ALIASES,
  SALES_REP_FIELD_ALIASES
} from '@/utils/autoMappingUtils';
import { supabase } from '@/integrations/supabase/client';
import { DataVerification } from '@/components/DataVerification';
import { DataPreview } from '@/components/DataPreview';
import { EnhancedValidationResults } from '@/components/EnhancedValidationResults';
import { ImportProgressMonitor } from '@/components/ImportProgressMonitor';
import { DataRecovery } from '@/components/DataRecovery';
import { loadDataImportState, saveDataImportState, clearDataImportState } from '@/utils/persistenceUtils';

interface ImportFile {
  id: string;
  name: string;
  type: 'accounts' | 'opportunities' | 'sales_reps';
  size: number;
  status: 'uploaded' | 'mapped' | 'validating' | 'validated' | 'completed' | 'error' | 'warning';
  rowCount?: number;
  validRows?: number;
  errorCount?: number;
  warningCount?: number;
  errors?: string[];
  data?: any[];
  parsedData?: any[]; // Add this for the DataPreview component
  headers?: string[];
  fieldMappings?: { [csvField: string]: string };
  autoMappings?: { [csvField: string]: { schemaField: string; confidence: number; matchType: string } };
  autoMappingSummary?: {
    totalMapped: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    requiredFieldsMapped: number;
    requiredFieldsTotal: number;
  };
  validationResult?: {
    validData: any[];
    errors: string[];
    warnings: string[];
    criticalErrors: string[];
    totalRows: number;
    validRows: number;
  };
  importResult?: ImportResult;
}

interface FieldMapping {
  csvField: string;
  schemaField: string;
  required: boolean;
  mapped: boolean;
}

export const DataImport = () => {
  const { toast } = useToast();
  const { effectiveProfile, loading: authLoading } = useAuth();
  
  // State with persistence
  const [files, setFiles] = useState<ImportFile[]>(() => {
    const restored = loadDataImportState.files();
    console.log('🔄 Restored files from localStorage:', restored.length, 'files');
    
    // Validate restored files for missing essential data
    const validatedFiles = restored.map((file: any) => {
      // Skip validation for auto-loaded existing data (already in Supabase)
      if (file.id && file.id.startsWith('existing-')) {
        console.log(`⏭️ Skipping header validation for existing Supabase data: ${file.name}`);
        return file;
      }

      if (!file.headers || !Array.isArray(file.headers) || file.headers.length === 0) {
        console.warn(`🚫 File "${file.name}" missing headers, marking for re-upload`);
        return {
          ...file,
          status: 'error' as const,
          error: 'Data missing - please re-upload this file'
        };
      }
      return file;
    });
    
    return validatedFiles;
  });
  
  const [activeTab, setActiveTab] = useState(() => loadDataImportState.activeTab());
  const [selectedFile, setSelectedFile] = useState<ImportFile | null>(null);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(() => loadDataImportState.currentBuildId());
  const [availableBuilds, setAvailableBuilds] = useState<Array<{id: string, name: string}>>([]);
  const [isCreatingBuild, setIsCreatingBuild] = useState(false);
  const [newBuildName, setNewBuildName] = useState('');

  // Persist state changes with error handling
  useEffect(() => {
    console.log('💾 Persisting files to localStorage:', files.length, 'files');
    try {
      saveDataImportState.files(files);
    } catch (error) {
      console.error('Failed to persist files:', error);
      
      if (error instanceof Error && error.message.includes('Storage quota exceeded')) {
        // Only show the error once and reset state
        toast({
          title: "Storage Error", 
          description: "Storage quota exceeded. Import state has been reset. Please re-upload your files.",
          variant: "destructive",
        });
        
        // Reset files state completely to prevent error loop
        setFiles([]);
        return; // Exit early to prevent further processing
      }
      
      // For other errors, show generic message
      toast({
        title: "Storage Error", 
        description: "Failed to save import progress. Your work may not be preserved.",
        variant: "destructive",
      });
    }
  }, [files, toast]);

  useEffect(() => {
    saveDataImportState.activeTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (currentBuildId) {
      saveDataImportState.currentBuildId(currentBuildId);
    }
  }, [currentBuildId]);

  // Debug file state changes
  useEffect(() => {
    console.log('📊 FILES STATE CHANGED:', {
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      timestamp: new Date().toISOString()
    });
  }, [files]);
  
  // File input refs
  const accountsInputRef = useRef<HTMLInputElement>(null);
  const opportunitiesInputRef = useRef<HTMLInputElement>(null);
  const salesRepsInputRef = useRef<HTMLInputElement>(null);
  
  // Load available builds on component mount
  useEffect(() => {
    console.log('🏗️ Loading builds on mount');
    loadBuilds();
  }, []);

  const loadBuilds = useCallback(async () => {
    console.log('🏗️ Loading builds...');
    const { data, error } = await supabase
      .from('builds')
      .select('id, name')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      console.log('✅ Builds loaded:', data.length);
      setAvailableBuilds(data);
      if (data.length > 0 && !currentBuildId) {
        console.log('🎯 Setting default build:', data[0].name);
        setCurrentBuildId(data[0].id);
      }
    } else {
      console.error('❌ Failed to load builds:', error);
    }
  }, [currentBuildId]);

  // Load existing imported data from Supabase to show in "Uploaded Files" table
  useEffect(() => {
    const loadExistingData = async () => {
      if (!currentBuildId) return;

      console.log('🔍 Checking for existing imported data in build:', currentBuildId);

      try {
        // Check what data exists in Supabase for this build
        const [accountsRes, oppsRes, repsRes] = await Promise.all([
          supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('build_id', currentBuildId),
          supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('build_id', currentBuildId),
          supabase.from('sales_reps').select('id', { count: 'exact', head: true }).eq('build_id', currentBuildId)
        ]);

        const existingFiles: ImportFile[] = [];

        // Add accounts if they exist
        if (accountsRes.count && accountsRes.count > 0) {
          existingFiles.push({
            id: 'existing-accounts',
            name: 'Imported Accounts',
            type: 'accounts',
            size: 0,
            data: [],
            headers: [],
            rowCount: accountsRes.count,
            status: 'completed',
            fieldMappings: {},
            validationResult: null
          });
          console.log(`✅ Found ${accountsRes.count} accounts in Supabase`);
        }

        // Add opportunities if they exist
        if (oppsRes.count && oppsRes.count > 0) {
          existingFiles.push({
            id: 'existing-opportunities',
            name: 'Imported Opportunities',
            type: 'opportunities',
            size: 0,
            data: [],
            headers: [],
            rowCount: oppsRes.count,
            status: 'completed',
            fieldMappings: {},
            validationResult: null
          });
          console.log(`✅ Found ${oppsRes.count} opportunities in Supabase`);
        }

        // Add sales reps if they exist
        if (repsRes.count && repsRes.count > 0) {
          existingFiles.push({
            id: 'existing-sales-reps',
            name: 'Imported Sales Reps',
            type: 'sales_reps',
            size: 0,
            data: [],
            headers: [],
            rowCount: repsRes.count,
            status: 'completed',
            fieldMappings: {},
            validationResult: null
          });
          console.log(`✅ Found ${repsRes.count} sales reps in Supabase`);
        }

        // Only update files if we found existing data and files array is empty
        if (existingFiles.length > 0 && files.length === 0) {
          console.log(`📊 Loading ${existingFiles.length} existing data files into UI`);
          setFiles(existingFiles);
        }

      } catch (error) {
        console.error('❌ Error loading existing data:', error);
      }
    };

    loadExistingData();
  }, [currentBuildId, files.length]);

  const createBuild = async () => {
    if (!newBuildName.trim()) {
      toast({
        title: "Build Name Required",
        description: "Please enter a name for your build.",
        variant: "destructive"
      });
      return;
    }

    setIsCreatingBuild(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from('builds')
        .insert([{
          name: newBuildName.trim(),
          description: `Build created from Import page - ${new Date().toLocaleDateString()}`,
          status: 'DRAFT',
          created_by: user.id
        }])
        .select('id, name')
        .single();

      if (error) throw error;

      // Refresh builds list and select new build
      await loadBuilds();
      setCurrentBuildId(data.id);
      setNewBuildName('');
      setActiveTab('upload'); // Move to upload tab after creating build

      toast({
        title: "Build Created Successfully",
        description: `Build "${data.name}" has been created and selected.`
      });
    } catch (error: any) {
      toast({
        title: "Failed to Create Build",
        description: error.message || "An error occurred while creating the build.",
        variant: "destructive"
      });
    } finally {
      setIsCreatingBuild(false);
    }
  };

  // Enhanced field mappings with priority grouping for better user experience
  interface PriorityFieldMapping extends FieldMapping {
    priority: 'essential' | 'high' | 'secondary';
    description?: string;
  }

  // Account field mappings organized by priority for account management focus
  const [accountMappings] = useState<PriorityFieldMapping[]>([
    // Essential fields - Required for basic account functionality
    { csvField: '', schemaField: 'sfdc_account_id', required: true, mapped: false, priority: 'essential', description: 'Unique Salesforce Account ID (18-digit)' },
    { csvField: '', schemaField: 'account_name', required: true, mapped: false, priority: 'essential', description: 'Company or organization name' },
    
    // High priority fields - Critical for territory assignment and revenue tracking
    { csvField: '', schemaField: 'owner_id', required: false, mapped: false, priority: 'high', description: 'Account owner user ID' },
    { csvField: '', schemaField: 'owner_name', required: false, mapped: false, priority: 'high', description: 'Account owner full name' },
    { csvField: '', schemaField: 'ultimate_parent_id', required: false, mapped: false, priority: 'high', description: 'Ultimate parent account ID for hierarchy' },
    { csvField: '', schemaField: 'ultimate_parent_name', required: false, mapped: false, priority: 'high', description: 'Ultimate parent account name' },
    { csvField: '', schemaField: 'sales_territory', required: false, mapped: false, priority: 'high', description: 'Sales territory assignment' },
    { csvField: '', schemaField: 'hq_country', required: false, mapped: false, priority: 'high', description: 'Headquarters country for geo assignment' },
    { csvField: '', schemaField: 'arr', required: false, mapped: false, priority: 'high', description: 'Annual Recurring Revenue' },
    { csvField: '', schemaField: 'hierarchy_bookings_arr_converted', required: false, mapped: false, priority: 'high', description: 'Hierarchy Bookings ARR (converted)' },
    { csvField: '', schemaField: 'employees', required: false, mapped: false, priority: 'high', description: 'Number of employees at this account' },
    { csvField: '', schemaField: 'initial_sale_tier', required: false, mapped: false, priority: 'high', description: 'Initial sale priority tier' },
    
    // Secondary fields - Additional data for analysis and reporting
    { csvField: '', schemaField: 'parent_id', required: false, mapped: false, priority: 'secondary', description: 'Direct parent account ID' },
    { csvField: '', schemaField: 'geo', required: false, mapped: false, priority: 'secondary', description: 'Geographic region' },
    { csvField: '', schemaField: 'ultimate_parent_employee_size', required: false, mapped: false, priority: 'secondary', description: 'Ultimate parent company size' },
    { csvField: '', schemaField: 'atr', required: false, mapped: false, priority: 'secondary', description: 'Annual Total Revenue' },
    { csvField: '', schemaField: 'renewal_date', required: false, mapped: false, priority: 'secondary', description: 'Contract renewal date' },
    { csvField: '', schemaField: 'expansion_tier', required: false, mapped: false, priority: 'secondary', description: 'Expansion priority tier' },
    { csvField: '', schemaField: 'account_type', required: false, mapped: false, priority: 'secondary', description: 'Account classification type' },
    { csvField: '', schemaField: 'enterprise_vs_commercial', required: false, mapped: false, priority: 'secondary', description: 'Enterprise or Commercial segment' },
    { csvField: '', schemaField: 'industry', required: false, mapped: false, priority: 'secondary', description: 'Primary industry vertical' },
    { csvField: '', schemaField: 'expansion_score', required: false, mapped: false, priority: 'secondary', description: 'Expansion opportunity score' },
    { csvField: '', schemaField: 'initial_sale_score', required: false, mapped: false, priority: 'secondary', description: 'Initial sales priority score' },
    { csvField: '', schemaField: 'has_customer_hierarchy', required: false, mapped: false, priority: 'secondary', description: 'Account has customer hierarchy' },
    { csvField: '', schemaField: 'in_customer_hierarchy', required: false, mapped: false, priority: 'secondary', description: 'Part of a customer hierarchy' },
    { csvField: '', schemaField: 'include_in_emea', required: false, mapped: false, priority: 'secondary', description: 'Include in EMEA region' },
    { csvField: '', schemaField: 'is_parent', required: false, mapped: false, priority: 'secondary', description: 'Is a parent account' },
    { csvField: '', schemaField: 'is_2_0', required: false, mapped: false, priority: 'secondary', description: 'Version 2.0 flag' },
    { csvField: '', schemaField: 'owners_lifetime_count', required: false, mapped: false, priority: 'secondary', description: 'Total number of owners over time' },
    { csvField: '', schemaField: 'inbound_count', required: false, mapped: false, priority: 'secondary', description: 'Number of inbound leads' },
    { csvField: '', schemaField: 'idr_count', required: false, mapped: false, priority: 'secondary', description: 'Inside sales rep count' },
    { csvField: '', schemaField: 'risk_flag', required: false, mapped: false, priority: 'secondary', description: 'Account at-risk flag' },
    { csvField: '', schemaField: 'cre_risk', required: false, mapped: false, priority: 'secondary', description: 'Customer Risk & Expansion flag' }
  ]);

  // Opportunity field mappings optimized for pipeline and revenue tracking
  const [opportunityMappings] = useState<PriorityFieldMapping[]>([
    // Essential fields - Required for basic opportunity tracking
    { csvField: '', schemaField: 'sfdc_opportunity_id', required: true, mapped: false, priority: 'essential', description: 'Unique Salesforce Opportunity ID' },
    { csvField: '', schemaField: 'sfdc_account_id', required: true, mapped: false, priority: 'essential', description: 'Related Account ID' },
    
    // High priority fields - Critical for pipeline management and revenue forecasting
    { csvField: '', schemaField: 'opportunity_name', required: false, mapped: false, priority: 'high', description: 'Opportunity name' },
    { csvField: '', schemaField: 'opportunity_type', required: false, mapped: false, priority: 'high', description: 'Opportunity type (New Business, Expansion, Renewal)' },
    { csvField: '', schemaField: 'stage', required: false, mapped: false, priority: 'high', description: 'Current sales stage' },
     { csvField: '', schemaField: 'close_date', required: false, mapped: false, priority: 'high', description: 'Expected close date' },
     { csvField: '', schemaField: 'created_date', required: false, mapped: false, priority: 'high', description: 'Opportunity creation date' },
     { csvField: '', schemaField: 'owner_id', required: false, mapped: false, priority: 'high', description: 'Opportunity owner user ID' },
     { csvField: '', schemaField: 'owner_name', required: false, mapped: false, priority: 'high', description: 'Opportunity owner name' },
     { csvField: '', schemaField: 'available_to_renew', required: false, mapped: false, priority: 'high', description: 'Amount available to renew' },
     { csvField: '', schemaField: 'cre_status', required: false, mapped: false, priority: 'high', description: 'Customer Risk & Expansion status' },
     { csvField: '', schemaField: 'renewal_event_date', required: false, mapped: false, priority: 'high', description: 'Contract renewal event date' },
     { csvField: '', schemaField: 'net_arr', required: false, mapped: false, priority: 'high', description: 'Net Annual Recurring Revenue' },
    
    // Secondary fields - Additional context and historical data
    { csvField: '', schemaField: 'created_date', required: false, mapped: false, priority: 'secondary', description: 'Opportunity creation date' }
  ]);

  // Sales Rep field mappings focused on organizational structure
  const [salesRepMappings] = useState<PriorityFieldMapping[]>([
    // Essential fields - Required for basic rep identification
    { csvField: '', schemaField: 'rep_id', required: true, mapped: false, priority: 'essential', description: 'Unique sales rep identifier (User ID, SFDC ID)' },
    { csvField: '', schemaField: 'name', required: true, mapped: false, priority: 'essential', description: 'Sales representative full name' },
    
    // High priority fields - Critical for management hierarchy and territory assignment
    { csvField: '', schemaField: 'team', required: false, mapped: false, priority: 'high', description: 'Sales team assignment' },
    { csvField: '', schemaField: 'manager', required: false, mapped: false, priority: 'high', description: 'Direct manager name' },
    { csvField: '', schemaField: 'flm', required: false, mapped: false, priority: 'high', description: 'First Level Manager' },
    { csvField: '', schemaField: 'slm', required: false, mapped: false, priority: 'high', description: 'Second Level Manager' },
    { csvField: '', schemaField: 'region', required: false, mapped: false, priority: 'high', description: 'Geographic region assignment' }
  ]);

  const csvFields = [
    'Account_ID__c',
    'Account_Name__c', 
    'Parent_Account__c',
    'Ultimate_Parent__c',
    'Country__c',
    'Territory__c',
    'Employee_Count__c',
    'Annual_Revenue__c',
    'Owner_ID__c'
  ];

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>, fileType: 'accounts' | 'opportunities' | 'sales_reps') => {
    console.log('🔥 FILE UPLOAD STARTED:', fileType, 'at', new Date().toISOString());
    console.log('📁 Current files count before upload:', files.length);
    
    // Check if a build is selected
    if (!currentBuildId) {
      toast({
        title: "No Build Selected",
        description: "Please create or select a build before uploading files.",
        variant: "destructive"
      });
      return;
    }

    const uploadedFiles = Array.from(event.target.files || []);
    console.log('Number of files selected:', uploadedFiles.length);
    
    uploadedFiles.forEach(file => {
      console.log('Processing file:', file.name, 'with type:', fileType);
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvContent = e.target?.result as string;
        
        // Just parse CSV structure without validation
        const parseResult = parseCSV(csvContent);
        
        // Perform auto-mapping using correct aliases for file type
        const autoMappings = autoMapFields(parseResult.headers, fileType);
        const fieldMappings = convertToFieldMappings(autoMappings);
        
        // Get required fields based on file type
        let requiredFields: string[] = [];
        if (fileType === 'accounts') {
          requiredFields = ACCOUNT_FIELD_ALIASES.filter(f => f.required).map(f => f.schemaField);
        } else if (fileType === 'opportunities') {
          requiredFields = OPPORTUNITY_FIELD_ALIASES.filter(f => f.required).map(f => f.schemaField);
        } else if (fileType === 'sales_reps') {
          requiredFields = SALES_REP_FIELD_ALIASES.filter(f => f.required).map(f => f.schemaField);
        }
        
        const autoMappingSummary = getAutoMappingSummary(autoMappings, requiredFields);
        
        // Determine status based on auto-mapping results
        let status: ImportFile['status'] = 'uploaded';
        if (parseResult.errors.length > 0) {
          status = 'error';
        } else if (autoMappingSummary.requiredFieldsMapped === autoMappingSummary.requiredFieldsTotal) {
          status = 'mapped';
        }

        const newFile: ImportFile = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: fileType,
          size: file.size,
          status,
          rowCount: parseResult.totalRows,
          validRows: parseResult.validRows,
          errorCount: parseResult.errors.length,
          errors: parseResult.errors,
          data: parseResult.data,
          parsedData: parseResult.data, // Add parsedData for DataPreview component
          headers: parseResult.headers,
          fieldMappings,
          autoMappings,
          autoMappingSummary
        };
        
        console.log('✅ Created new file object:', newFile.name, 'with type:', newFile.type);
        console.log('📝 Adding to files array. Current count:', files.length);
        
        setFiles(prev => {
          // Check for duplicate files by name and type
          const existingFileIndex = prev.findIndex(f => f.name === newFile.name && f.type === newFile.type);
          
          let newFiles;
          if (existingFileIndex >= 0) {
            // Replace existing file instead of adding duplicate
            console.log('🔄 Replacing existing file:', newFile.name);
            newFiles = prev.map((f, index) => index === existingFileIndex ? newFile : f);
          } else {
            // Add new file
            newFiles = [...prev, newFile];
          }
          
          console.log('🔄 Files array updated. New count:', newFiles.length);
          return newFiles;
        });
        
        if (parseResult.errors.length === 0) {
          const autoMappedCount = Object.keys(autoMappings).length;
          const requiredMappedCount = autoMappingSummary.requiredFieldsMapped;
          
          if (autoMappedCount > 0) {
            toast({
              title: "File Uploaded with Auto-Mapping",
              description: `${parseResult.totalRows} rows uploaded. ${autoMappedCount} fields auto-mapped (${requiredMappedCount}/${autoMappingSummary.requiredFieldsTotal} required).`,
            });
          } else {
            toast({
              title: "File Uploaded Successfully", 
              description: `${parseResult.totalRows} rows uploaded. Please map fields to continue.`,
            });
          }
          // Auto-switch to mapping tab
          setActiveTab('mapping');
        } else {
          toast({
            title: "File Upload Error",
            description: `${parseResult.errors.length} parsing errors found.`,
            variant: "destructive",
          });
        }
      };
      
      reader.readAsText(file);
    });

    // Reset file input
    event.target.value = '';
  }, [files.length, currentBuildId, toast, setActiveTab]);

  const downloadSampleFile = (fileType: 'accounts' | 'opportunities' | 'sales_reps') => {
    let csvContent: string;
    let filename: string;
    
    if (fileType === 'accounts') {
      csvContent = generateSampleAccountsCSV();
      filename = 'sample_accounts.csv';
    } else if (fileType === 'opportunities') {
      csvContent = generateSampleOpportunitiesCSV();
      filename = 'sample_opportunities.csv';
    } else {
      csvContent = generateSampleSalesRepsCSV();
      filename = 'sample_sales_reps.csv';
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Sample Downloaded",
      description: `${filename} has been downloaded`,
    });
  };

  const handleDeleteFile = useCallback(async (fileId: string) => {
    console.log('🗑️ DELETING FILE:', fileId);

    // Find the file to get its type and determine what data to delete
    const fileToDelete = files.find(f => f.id === fileId);
    if (!fileToDelete) {
      console.warn('File not found:', fileId);
      return;
    }

    try {
      // Delete the actual data from Supabase based on file type
      if (fileToDelete.type === 'accounts') {
        console.log('🗑️ Deleting accounts from Supabase for build:', currentBuildId);
        const { error } = await supabase
          .from('accounts')
          .delete()
          .eq('build_id', currentBuildId);

        if (error) {
          console.error('❌ Error deleting accounts:', error);
          throw error;
        }
        console.log('✅ Accounts deleted from Supabase');

      } else if (fileToDelete.type === 'opportunities') {
        console.log('🗑️ Deleting opportunities from Supabase for build:', currentBuildId);
        const { error } = await supabase
          .from('opportunities')
          .delete()
          .eq('build_id', currentBuildId);

        if (error) {
          console.error('❌ Error deleting opportunities:', error);
          throw error;
        }
        console.log('✅ Opportunities deleted from Supabase');

      } else if (fileToDelete.type === 'sales_reps') {
        console.log('🗑️ Deleting sales reps from Supabase for build:', currentBuildId);
        const { error } = await supabase
          .from('sales_reps')
          .delete()
          .eq('build_id', currentBuildId);

        if (error) {
          console.error('❌ Error deleting sales reps:', error);
          throw error;
        }
        console.log('✅ Sales reps deleted from Supabase');
      }

      // Remove from UI state
      setFiles(prev => {
        const filtered = prev.filter(f => f.id !== fileId);
        console.log('📊 Files after deletion:', filtered.length);
        return filtered;
      });

      // Close mapping dialog if the deleted file was selected
      if (selectedFile?.id === fileId) {
        setSelectedFile(null);
        setShowMappingDialog(false);
      }

      toast({
        title: "File and Data Deleted",
        description: `${fileToDelete.type} data has been removed from the database`,
      });

    } catch (error) {
      console.error('💥 Error deleting file data:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete data from database",
        variant: "destructive"
      });
    }
  }, [files, selectedFile?.id, currentBuildId, toast]);

  const autoMapAllFields = (file: ImportFile) => {
    if (!file.autoMappings) return;
    
    const allMappings = convertToFieldMappings(file.autoMappings);
    const updatedFile = {
      ...file,
      fieldMappings: allMappings,
      status: 'mapped' as ImportFile['status']
    };
    
    setFiles(prev => prev.map(f => 
      f.id === file.id ? updatedFile : f
    ));
    
    if (selectedFile?.id === file.id) {
      setSelectedFile(updatedFile);
    }
    
    toast({
      title: "Auto-Mapping Applied",
      description: `${Object.keys(allMappings).length} fields mapped automatically`,
    });
  };

  const clearAllMappings = (file: ImportFile) => {
    const updatedFile = {
      ...file,
      fieldMappings: {},
      status: 'uploaded' as ImportFile['status']
    };
    
    setFiles(prev => prev.map(f => 
      f.id === file.id ? updatedFile : f
    ));
    
    if (selectedFile?.id === file.id) {
      setSelectedFile(updatedFile);
    }
    
    toast({
      title: "Mappings Cleared",
      description: "All field mappings have been reset",
    });
  };

  const handleStartMapping = useCallback((file: ImportFile) => {
    console.log('🗺️ STARTING MAPPING for:', file.name);
    setSelectedFile(file);
    setShowMappingDialog(true);
  }, []);

  const getCurrentMappings = (fileType: 'accounts' | 'opportunities' | 'sales_reps'): PriorityFieldMapping[] => {
    console.log('📋 getCurrentMappings called with fileType:', fileType);
    let mappings: PriorityFieldMapping[];
    
    switch (fileType) {
      case 'accounts':
        console.log('✅ Returning account mappings, count:', accountMappings.length);
        mappings = accountMappings;
        break;
      case 'opportunities':
        console.log('✅ Returning opportunity mappings, count:', opportunityMappings.length);
        mappings = opportunityMappings;
        break;
      case 'sales_reps':
        console.log('✅ Returning sales rep mappings, count:', salesRepMappings.length);
        mappings = salesRepMappings;
        break;
      default:
        console.error('🚫 Unknown file type for mappings:', fileType);
        console.log('Available types: accounts, opportunities, sales_reps');
        mappings = accountMappings; // fallback
    }
    
    // Validate mappings array
    if (!Array.isArray(mappings)) {
      console.error('🚫 Mappings is not an array for fileType:', fileType);
      return [];
    }
    
    console.log('📊 Mapping validation for', fileType, ':', {
      totalMappings: mappings.length,
      essential: mappings.filter(m => m.priority === 'essential').length,
      high: mappings.filter(m => m.priority === 'high').length,
      secondary: mappings.filter(m => m.priority === 'secondary').length
    });
    
    // Return sorted by priority: essential → high → secondary
    const priorityOrder = { essential: 0, high: 1, secondary: 2 };
    const sortedMappings = mappings.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    console.log('Returning sorted mappings for', fileType, ':', sortedMappings.map(m => m.schemaField));
    return sortedMappings;
  };

  const handleMappingChange = (schemaField: string, csvField: string) => {
    if (selectedFile) {
      const updatedMappings = csvField && csvField !== 'NOT_MAPPED' && csvField !== '__none__'
        ? { ...selectedFile.fieldMappings, [csvField]: schemaField }
        : Object.fromEntries(
            Object.entries(selectedFile.fieldMappings || {}).filter(([key, value]) => value !== schemaField)
          );
      
      const updatedFile = {
        ...selectedFile,
        fieldMappings: updatedMappings
      };
      
      // Update the file in the list and also update selectedFile
      setFiles(prev => prev.map(file => 
        file.id === selectedFile.id ? updatedFile : file
      ));
      setSelectedFile(updatedFile);
      
      // Update status to mapped if we have required fields mapped
      const currentMappings = getCurrentMappings(selectedFile.type);
      const requiredFields = currentMappings.filter(m => m.required).map(m => m.schemaField);
      const mappedRequiredFields = requiredFields.filter(field => 
        Object.values(updatedMappings || {}).includes(field)
      );
      
      if (mappedRequiredFields.length === requiredFields.length && updatedFile.status === 'uploaded') {
        const finalFile = { ...updatedFile, status: 'mapped' as const };
        setFiles(prev => prev.map(file => 
          file.id === selectedFile.id ? finalFile : file
        ));
        setSelectedFile(finalFile);
      }
    }
  };

  // Handler to download error report
  const handleDownloadErrorReport = useCallback((file: ImportFile) => {
    if (!file.validationResult) return;

    const errorData = [
      ['Type', 'Row', 'Issue'],
      ...file.validationResult.criticalErrors.map(error => ['Critical Error', '', error]),
      ...file.validationResult.warnings.map(warning => ['Warning', '', warning]),
      ...file.validationResult.errors.map(error => ['Error', '', error])
    ];

    const csvContent = errorData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name}_error_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const validateMappedFile = async (file: ImportFile) => {
    console.log('🔍 validateMappedFile called for:', file.name, 'with data length:', file.data?.length);

    // Skip validation for auto-loaded existing data (already in Supabase)
    if (file.id.startsWith('existing-')) {
      console.log('⏭️ Skipping validation for existing Supabase data:', file.name);
      return;
    }

    // Enhanced validation - check all required data exists
    if (!file.data || !Array.isArray(file.data)) {
      console.error('❌ File has no valid data array:', {
        fileName: file.name,
        dataType: typeof file.data,
        isArray: Array.isArray(file.data)
      });
      toast({
        title: "Data Missing", 
        description: `File "${file.name}" data needs to be reloaded. Please re-upload the file to validate.`,
        variant: "destructive",
      });
      
      // Update file status to indicate it needs re-upload
      setFiles(prev => prev.map(f => 
        f.id === file.id 
          ? { ...f, status: 'uploaded' as const, errors: ['Data missing - please re-upload file'] }
          : f
      ));
      return;
    }

    if (file.data.length === 0) {
      console.warn('⚠️ File has empty data array:', file.name);
      toast({
        title: "No Data", 
        description: `File "${file.name}" contains no data rows to validate.`,
        variant: "destructive",
      });
      return;
    }

    if (!file.fieldMappings || Object.keys(file.fieldMappings).length === 0) {
      console.error('❌ File has no field mappings:', file.name);
      toast({
        title: "Mapping Required", 
        description: `Please map fields for "${file.name}" before validation.`,
        variant: "destructive",
      });
      return;
    }

    // Set status to validating
    setFiles(prev => prev.map(f => 
      f.id === file.id 
        ? { ...f, status: 'validating' }
        : f
    ));

    try {
      const validationResult = validateMappedData(
        file.data, 
        file.fieldMappings, 
        file.type
      );

      // Additional business validation based on file type
      let businessValidationErrors: string[] = [];
      if (file.type === 'accounts' && validationResult.validData.length > 0) {
        businessValidationErrors = validateAccountData(validationResult.validData as AccountImportRow[]);
      } else if (file.type === 'opportunities' && validationResult.validData.length > 0) {
        businessValidationErrors = validateOpportunityData(validationResult.validData as OpportunityImportRow[]);
      }
      // Note: Sales reps don't have additional business validation beyond the mapped data validation

      // Combine business validation with existing errors
      const finalValidationResult = {
        ...validationResult,
        errors: [...validationResult.errors, ...businessValidationErrors]
      };

      // Determine status based on validation results
      let newStatus: ImportFile['status'];
      if (finalValidationResult.criticalErrors.length > 0) {
        newStatus = 'error';
      } else if (finalValidationResult.warnings.length > 0 || finalValidationResult.errors.length > 0) {
        newStatus = 'warning';
      } else {
        newStatus = 'validated';
      }

      setFiles(prev => prev.map(f => 
        f.id === file.id 
          ? { 
              ...f, 
              status: newStatus,
              validRows: finalValidationResult.validRows,
              errorCount: finalValidationResult.criticalErrors.length + finalValidationResult.errors.length,
              warningCount: finalValidationResult.warnings.length,
              errors: [...finalValidationResult.criticalErrors, ...finalValidationResult.errors],
              validationResult: finalValidationResult
            }
          : f
      ));

      // Show appropriate toast based on results
      if (finalValidationResult.criticalErrors.length > 0) {
        toast({
          title: "Validation Failed",
          description: `${finalValidationResult.criticalErrors.length} critical errors found. ${finalValidationResult.validRows}/${finalValidationResult.totalRows} rows can be imported.`,
          variant: "destructive",
        });
      } else if (finalValidationResult.warnings.length > 0 || finalValidationResult.errors.length > 0) {
        toast({
          title: "Validation Complete with Issues",
          description: `${finalValidationResult.warnings.length + finalValidationResult.errors.length} issues found. ${finalValidationResult.validRows}/${finalValidationResult.totalRows} rows ready for import.`,
        });
      } else {
        toast({
          title: "Validation Successful",
          description: `All ${finalValidationResult.totalRows} records are valid and ready for import.`,
        });
      }
      
      setActiveTab('validation');
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === file.id 
          ? { 
              ...f, 
              status: 'error',
              errors: [error instanceof Error ? error.message : 'Validation failed']
            }
          : f
      ));

      toast({
        title: "Validation Failed",
        description: "There was an error validating the data",
        variant: "destructive",
      });
    }
  };

  const handleValidateAndImport = async (file: ImportFile) => {
    console.log('🚀 handleValidateAndImport called for:', file.name, 'with validation result:', !!file.validationResult);
    
    // Enhanced pre-import validation
    if (!file.validationResult) {
      console.error('❌ No validation result found for file:', file.name);
      toast({
        title: "Validation Required", 
        description: `Please validate "${file.name}" before importing.`,
        variant: "destructive",
      });
      return;
    }

    if (!file.validationResult.validData || !Array.isArray(file.validationResult.validData)) {
      console.error('❌ Invalid validation data:', { 
        fileName: file.name, 
        validDataType: typeof file.validationResult.validData,
        isArray: Array.isArray(file.validationResult.validData)
      });
      toast({
        title: "Invalid Data", 
        description: `File "${file.name}" contains invalid validation data. Please re-validate.`,
        variant: "destructive",
      });
      return;
    }

    if (!currentBuildId) {
      toast({
        title: "Build Required",
        description: "Please select a build before importing data. Create a build first if none exist.",
        variant: "destructive",
      });
      return;
    }

    // Enhanced pre-import validation - check if build still exists
    const { data: buildExists } = await supabase
      .from('builds')
      .select('id, name, status')
      .eq('id', currentBuildId)
      .single();

    if (!buildExists) {
      toast({
        title: "Build Not Found",
        description: "Selected build no longer exists. Please select a different build.",
        variant: "destructive",
      });
      setCurrentBuildId(null);
      return;
    }

    if (file.validationResult.validRows === 0) {
      toast({
        title: "No Valid Data",
        description: "No valid records found to import",
        variant: "destructive",
      });
      return;
    }

    // Set status to importing (not validating - validation is already done)
    setFiles(prev => prev.map(f => 
      f.id === file.id 
        ? { ...f, status: 'validating' as const }
        : f
    ));

    try {
      let result: ImportResult;
      
      if (file.type === 'accounts') {
        result = await importAccountsToDatabase(
          file.validationResult.validData as AccountImportRow[],
          currentBuildId,
          (processed, total) => {
            console.log(`Importing accounts: ${processed}/${total}`);
            // Update UI to show import progress
            setFiles(prev => prev.map(f => 
              f.id === file.id 
                ? { ...f, status: 'validating' as const, importProgress: { processed, total } }
                : f
            ));
          }
        );
      } else if (file.type === 'opportunities') {
        // Cache busting verification
        console.log(`🔄 Cache Buster: Opportunities import starting at ${new Date().toISOString()}`);
        console.log('📦 Using optimized import strategy with foreign key validation');
        
        result = await importOpportunitiesToDatabase(
          file.validationResult.validData as OpportunityImportRow[],
          currentBuildId,
          (processed, total) => {
            console.log(`Importing opportunities: ${processed}/${total}`);
            // Update UI to show import progress
            setFiles(prev => prev.map(f => 
              f.id === file.id 
                ? { ...f, status: 'validating' as const, importProgress: { processed, total } }
                : f
            ));
          }
        );
      } else if (file.type === 'sales_reps') {
        result = await importSalesRepsToDatabase(
          file.validationResult.validData as SalesRepImportRow[],
          currentBuildId,
          (processed, total) => {
            console.log(`Importing sales reps: ${processed}/${total}`);
            // Update UI to show import progress
            setFiles(prev => prev.map(f => 
              f.id === file.id 
                ? { ...f, status: 'validating' as const, importProgress: { processed, total } }
                : f
            ));
          }
        );
      } else {
        throw new Error('Unsupported file type for import');
      }

      // Post-import verification - check actual database count
      const { count: actualCount } = await supabase
        .from(file.type === 'accounts' ? 'accounts' : file.type === 'opportunities' ? 'opportunities' : 'sales_reps')
        .select('id', { count: 'exact' })
        .eq('build_id', currentBuildId);

      const actualDatabaseCount = actualCount || 0;

      setFiles(prev => prev.map(f => 
        f.id === file.id 
          ? { 
              ...f, 
              status: result.success ? 'completed' : 'error',
              validRows: result.recordsImported,
              errorCount: result.errors.length,
              errors: result.errors,
              importResult: { ...result, actualDatabaseCount }
            }
          : f
      ));

      if (result.success) {
        toast({
          title: "Import Completed",
          description: `Successfully imported ${result.recordsImported} of ${result.recordsProcessed} records to build "${buildExists.name}". Database shows ${actualDatabaseCount} total records.`,
        });

        // Switch to verification tab to show user their data is ready
        setTimeout(() => {
          setActiveTab('verification');
        }, 1000);

        // Show verification confirmation after switching tabs
        if (actualDatabaseCount > 0) {
          setTimeout(() => {
            toast({
              title: "Data Verified & Ready",
              description: `✓ ${actualDatabaseCount} records confirmed in database. Your data is ready for book building.`,
            });
          }, 2500);
        }
      } else {
        toast({
          title: "Import Completed with Errors",
          description: `Imported ${result.recordsImported} records, ${result.errors.length} errors occurred. Database shows ${actualDatabaseCount} total records.`,
          variant: "destructive",
        });
        setActiveTab('validation');
      }
    } catch (error) {
      console.error('Import failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // Check for RLS policy violations specifically
      let friendlyMessage = errorMessage;
      if (errorMessage.includes('row-level security policy')) {
        friendlyMessage = `Permission denied. Please ensure you're logged in with REVOPS or LEADERSHIP role. Current role: ${effectiveProfile?.role || 'Unknown'}`;
      } else if (errorMessage.includes('duplicate key')) {
        friendlyMessage = 'Some records already exist. The import will update existing records and add new ones.';
      }

      setFiles(prev => prev.map(f => 
        f.id === file.id 
          ? { 
              ...f, 
              status: 'error',
              errors: [friendlyMessage]
            }
          : f
      ));

      toast({
        title: "Import Failed",
        description: friendlyMessage,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Errors Found</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500 text-white"><AlertTriangle className="w-3 h-3 mr-1" />Warnings</Badge>;
      case 'validating':
        return <Badge variant="outline" className="animate-pulse">Importing...</Badge>;
      case 'validated':
        return <Badge className="bg-green-500">Validated</Badge>;
      case 'mapped':
        return <Badge className="bg-blue-500">Fields Mapped</Badge>;
      case 'uploaded':
        return <Badge className="bg-yellow-500">Ready for Mapping</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const getFileTypeIcon = (type: string) => {
    switch (type) {
      case 'accounts':
        return <Database className="w-4 h-4" />;
      case 'opportunities':
        return <FileText className="w-4 h-4" />;
      case 'sales_reps':
        return <Settings className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  // Show loading state while auth is loading
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Show auth warning if not properly authenticated
  const showAuthWarning = !effectiveProfile || !['REVOPS', 'LEADERSHIP'].includes(effectiveProfile.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Import</h1>
        <p className="text-muted-foreground">
          Upload and validate your Salesforce data files with field mapping and hygiene checks
        </p>
        
        {showAuthWarning && (
          <Alert className="mt-4">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              {!effectiveProfile 
                ? "You must be logged in to import data." 
                : `Import requires REVOPS or LEADERSHIP role. Your current role: ${effectiveProfile.role}`
              }
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Build Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Target Build</CardTitle>
          <CardDescription>
            Choose which build to import your data into
          </CardDescription>
        </CardHeader>
        <CardContent>
          {availableBuilds.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground mb-4">
                No builds available. You need to create a build first before importing data.
              </p>
              <Button 
                onClick={() => window.location.href = '/'}
                variant="outline"
              >
                Go to Dashboard to Create Build
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Select value={currentBuildId || ''} onValueChange={setCurrentBuildId}>
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Select a build..." />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    console.log('🏗️ Rendering build SelectItems:', availableBuilds.length, 'total builds');
                    const validBuilds = availableBuilds.filter(build => {
                      const isValid = build && 
                        typeof build.id === 'string' && 
                        build.id.trim() !== '' && 
                        typeof build.name === 'string' && 
                        build.name.trim() !== '';
                      
                      if (!isValid) {
                        console.warn('🚫 Filtered invalid build:', build);
                      }
                      return isValid;
                    });
                    
                    console.log('✅ Valid builds for SelectItems:', validBuilds.length);
                    
                    return validBuilds.map(build => (
                      <SelectItem key={build.id} value={build.id.trim()}>
                        {build.name}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
              
              {currentBuildId && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Selected Build:</p>
                  <p className="text-sm text-muted-foreground">
                    {availableBuilds.find(b => b.id === currentBuildId)?.name}
                  </p>
                </div>
              )}
              
              {!currentBuildId && availableBuilds.length > 0 && (
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm font-medium text-yellow-800">Build Selection Required</p>
                  <p className="text-sm text-yellow-700">
                    Please select a build to associate your imported data with.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debug Tools - Only show in development or for debugging */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="border-dashed border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-orange-600">Debug Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearDataImportState();
                setFiles([]);
                setActiveTab('setup');
                setCurrentBuildId(null);
                toast({
                  title: "Import State Cleared",
                  description: "All import data has been reset for debugging.",
                });
              }}
              className="text-orange-600 border-orange-300 hover:bg-orange-50"
            >
              Clear Import State
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="upload">File Upload</TabsTrigger>
          <TabsTrigger value="mapping">Field Mapping</TabsTrigger>
          <TabsTrigger value="validation">Validation Results</TabsTrigger>
          <TabsTrigger value="verification">Data Verification</TabsTrigger>
          <TabsTrigger value="recovery">Data Recovery</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          {!currentBuildId ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Please create or select a build first before uploading files.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
            {/* Accounts Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Accounts CSV
                </CardTitle>
                <CardDescription>
                  Upload your accounts data with parent/child relationships
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Drag & drop or click to upload
                  </p>
                  <div className="space-y-2">
                    <Input
                      ref={accountsInputRef}
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleFileUpload(e, 'accounts')}
                      className="hidden"
                      id="accounts-upload"
                      multiple
                    />
                    <Button 
                      variant="outline" 
                      className="w-full cursor-pointer hover:bg-accent"
                      onClick={() => accountsInputRef.current?.click()}
                    >
                      Choose File
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full"
                      onClick={() => downloadSampleFile('accounts')}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Download Sample
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Opportunities Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Opportunities CSV
                </CardTitle>
                <CardDescription>
                  Upload open opportunities data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Drag & drop or click to upload
                  </p>
                  <div className="space-y-2">
                    <Input
                      ref={opportunitiesInputRef}
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleFileUpload(e, 'opportunities')}
                      className="hidden"
                      id="opportunities-upload"
                      multiple
                    />
                    <Button 
                      variant="outline" 
                      className="w-full cursor-pointer hover:bg-accent"
                      onClick={() => opportunitiesInputRef.current?.click()}
                    >
                      Choose File
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full"
                      onClick={() => downloadSampleFile('opportunities')}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Download Sample
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sales Reps Upload */}
            <Card>
              <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Sales Reps CSV
              </CardTitle>
                <CardDescription>
                  Upload sales representative data with Name, Manager, Team, Region, and Rep ID
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Drag & drop or click to upload
                  </p>
                  <Input
                    ref={salesRepsInputRef}
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'sales_reps')}
                    className="hidden"
                    id="sales-reps-upload"
                    multiple
                  />
                  <Button 
                    variant="outline" 
                    className="w-full cursor-pointer hover:bg-accent"
                    onClick={() => salesRepsInputRef.current?.click()}
                  >
                    Choose File
                  </Button>
                </div>
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadSampleFile('sales_reps')}
                    className="text-xs"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download Sample
                  </Button>
                </div>
              </CardContent>
            </Card>
           </div>
          )}

          {/* Uploaded Files Table */}
          {files.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Files</CardTitle>
                <CardDescription>
                  Review and manage your uploaded data files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow key={file.id}>
                       <TableCell>
                         <div className="flex items-center gap-2">
                           {getFileTypeIcon(file.type)}
                           <span className="font-medium">{file.name}</span>
                         </div>
                       </TableCell>
                       <TableCell className="capitalize">{file.type.replace('_', ' ')}</TableCell>
                       <TableCell>{Math.round(file.size / 1024)} KB</TableCell>
                       <TableCell>{file.rowCount?.toLocaleString()}</TableCell>
                       <TableCell>{getStatusBadge(file.status)}</TableCell>
                       <TableCell>
                         <div className="flex items-center gap-2">
                           {file.status === 'uploaded' && (
                             <Button size="sm" onClick={() => handleStartMapping(file)}>
                               Map Fields
                             </Button>
                           )}
                           {file.status === 'validated' && (
                             <Button size="sm" onClick={() => handleValidateAndImport(file)}>
                               Import Data
                             </Button>
                           )}
                           {(file.status === 'warning') && (
                             <Button size="sm" onClick={() => handleValidateAndImport(file)}>
                               Import Valid Data
                             </Button>
                           )}
                           {file.status === 'error' && (
                             <Button size="sm" variant="outline">
                               View Errors
                             </Button>
                           )}
                           <Button 
                             size="sm" 
                             variant="ghost" 
                             onClick={() => handleDeleteFile(file.id)}
                             className="text-destructive hover:text-destructive"
                           >
                             <Trash2 className="w-4 h-4" />
                           </Button>
                         </div>
                       </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="mapping" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Field Mapping Status</CardTitle>
              <CardDescription>
                Map CSV columns to database schema fields for each uploaded file
              </CardDescription>
            </CardHeader>
            <CardContent>
              {files.filter(f => f.status === 'uploaded' || f.status === 'mapped' || f.status === 'validated' || f.status === 'completed').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Files Ready for Mapping</h3>
                  <p>Upload files first to begin field mapping.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {files.filter(f => f.status === 'uploaded' || f.status === 'mapped' || f.status === 'validated' || f.status === 'completed').map(file => (
                    <div key={file.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getFileTypeIcon(file.type)}
                          <span className="font-medium">{file.name}</span>
                          {getStatusBadge(file.status)}
                        </div>
                        <div className="flex gap-2">
                          {file.autoMappings && Object.keys(file.autoMappings).length > 0 && (
                            <Button size="sm" variant="outline" onClick={() => autoMapAllFields(file)}>
                              Auto Map All
                            </Button>
                          )}
                          {file.fieldMappings && Object.keys(file.fieldMappings).length > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => clearAllMappings(file)}>
                              Clear All
                            </Button>
                          )}
                          <Button size="sm" onClick={() => handleStartMapping(file)}>
                            Configure Mapping
                          </Button>
                          {file.status === 'mapped' && (
                            <Button size="sm" onClick={() => validateMappedFile(file)}>
                              Validate Data
                            </Button>
                          )}
                        </div>
                      </div>
                      
              {/* Auto-mapping summary */}
              {file.autoMappingSummary && (
                <div className="mb-3 p-3 bg-muted/20 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">Auto-Mapping Results</h4>
                    <Badge variant="outline">
                      {file.autoMappingSummary.requiredFieldsMapped}/{file.autoMappingSummary.requiredFieldsTotal} required fields
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {Object.keys(file.autoMappings || {}).length} fields automatically mapped
                  </p>
                </div>
              )}
                      
                       <p className="text-sm text-muted-foreground">
                         {Object.keys(file.fieldMappings || {}).length} of {getCurrentMappings(file.type).length} fields mapped
                       </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validation Results</CardTitle>
              <CardDescription>
                Review data quality and hygiene check results
              </CardDescription>
            </CardHeader>
            <CardContent>
              {files.filter(f => f.validationResult).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Validation Results</h3>
                  <p>Complete field mapping and validation to see detailed results.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {files.filter(f => f.validationResult).map(file => (
                    <div key={file.id} className="space-y-4">
                      {/* Data Preview Component */}
                      {file.parsedData && file.headers && (
                        <DataPreview
                          data={file.parsedData.slice(0, 20)} // Show first 20 rows for preview
                          headers={file.headers}
                          fileName={file.name}
                          fileType={file.type}
                          fieldMappings={file.fieldMappings}
                        />
                      )}

                      {/* Enhanced Validation Results Component */}
                      <EnhancedValidationResults
                        file={file}
                        onImport={handleValidateAndImport}
                        onDownloadErrorReport={handleDownloadErrorReport}
                      />

                      {/* Original validation display for backward compatibility */}
                      <div className="border rounded-lg p-4 bg-muted/10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {getFileTypeIcon(file.type)}
                            <span className="font-medium">{file.name}</span>
                            {getStatusBadge(file.status)}
                          </div>
                        </div>
                        
                        {file.validationResult && (
                          <div className="space-y-4">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="text-center p-3 bg-muted/20 rounded-lg">
                                <div className="text-2xl font-bold text-foreground">
                                  {file.validationResult.totalRows}
                                </div>
                                <div className="text-sm text-muted-foreground">Total Records</div>
                              </div>
                              <div className="text-center p-3 bg-green-50 rounded-lg">
                                <div className="text-2xl font-bold text-green-600">
                                  {file.validationResult.validRows}
                                </div>
                                <div className="text-sm text-muted-foreground">Valid Records</div>
                              </div>
                              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                                <div className="text-2xl font-bold text-yellow-600">
                                  {file.validationResult.warnings.length}
                                </div>
                                <div className="text-sm text-muted-foreground">Warnings</div>
                              </div>
                              <div className="text-center p-3 bg-red-50 rounded-lg">
                                <div className="text-2xl font-bold text-red-600">
                                  {file.validationResult.criticalErrors.length}
                                </div>
                                <div className="text-sm text-muted-foreground">Critical Errors</div>
                              </div>
                            </div>

                            {/* Import Action */}
                            {file.validationResult.validRows > 0 && (
                              <div className="flex justify-between items-center p-4 bg-green-50 border border-green-200 rounded-lg">
                                <div>
                                  <div className="font-medium text-green-800">Ready for Import</div>
                                  <div className="text-sm text-green-600">
                                    {file.validationResult.validRows} records can be imported
                                    {file.validationResult.criticalErrors.length > 0 && 
                                      ` (${file.validationResult.criticalErrors.length} records will be skipped due to critical errors)`
                                    }
                                  </div>
                                </div>
                                <Button 
                                  onClick={() => handleValidateAndImport(file)}
                                  disabled={file.status === 'validating' || !currentBuildId}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  {file.status === 'validating' ? 'Importing...' : 'Import Data'}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Verification Tab */}
        <TabsContent value="verification" className="space-y-4">
          {currentBuildId && (
            <DataVerification 
              buildId={currentBuildId} 
              buildName={availableBuilds.find(b => b.id === currentBuildId)?.name || 'Current Build'}
            />
          )}
          {!currentBuildId && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Database className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">Select a Build</h3>
                  <p>Choose or create a build above to view data verification</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Data Recovery Tab */}
        <TabsContent value="recovery" className="space-y-4">
          {currentBuildId && (
            <DataRecovery 
              buildId={currentBuildId}
              onRecoveryComplete={() => {
                toast({
                  title: "Recovery Complete",
                  description: "Data recovery has been completed successfully.",
                });
              }}
            />
          )}
          {!currentBuildId && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center min-h-[200px]">
                <div className="text-center">
                  <Database className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">Select a Build</h3>
                  <p>Choose or create a build above to access data recovery tools</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Field Mapping Dialog */}
      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Map Fields - {selectedFile?.name}</DialogTitle>
            <DialogDescription>
              Map your CSV columns to the required database schema fields.
            </DialogDescription>
          </DialogHeader>
          
          {/* Auto-mapping controls */}
          {selectedFile?.autoMappings && Object.keys(selectedFile.autoMappings).length > 0 && (
            <div className="p-4 bg-muted/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Auto-Mapping Available</h4>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => selectedFile && autoMapAllFields(selectedFile)}>
                    Apply All Auto-Mappings
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => selectedFile && clearAllMappings(selectedFile)}>
                    Clear All
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {Object.keys(selectedFile.autoMappings).length} fields detected with automatic mapping suggestions
              </p>
            </div>
          )}
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schema Field</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>CSV Column</TableHead>
                </TableRow>
              </TableHeader>
               <TableBody>
                 {selectedFile && (() => {
                   console.log('=== MAPPING DIALOG DEBUG ===');
                   console.log('selectedFile.name:', selectedFile.name, 'selectedFile.type:', selectedFile.type);
                   const mappings = getCurrentMappings(selectedFile.type);
                   console.log('mappings returned from getCurrentMappings:', mappings.length, 'fields');
                   console.log('mapping fields:', mappings.map(m => m.schemaField));
                   const groupedMappings = {
                     essential: mappings.filter(m => m.priority === 'essential'),
                     high: mappings.filter(m => m.priority === 'high'), 
                     secondary: mappings.filter(m => m.priority === 'secondary')
                   };
                   console.log('grouped mappings - essential:', groupedMappings.essential.length, 'high:', groupedMappings.high.length, 'secondary:', groupedMappings.secondary.length);
                   
                   const renderMappingRow = (mapping: PriorityFieldMapping, index: number) => {
                     const currentMapping = Object.entries(selectedFile?.fieldMappings || {}).find(([key, value]) => value === mapping.schemaField)?.[0];
                     const autoMapping = selectedFile?.autoMappings ? Object.entries(selectedFile.autoMappings).find(([key, value]) => value.schemaField === mapping.schemaField) : null;
                     
                     return (
                       <TableRow key={`${mapping.priority}-${index}`} className={mapping.priority === 'essential' ? 'bg-red-50/50' : mapping.priority === 'high' ? 'bg-yellow-50/50' : ''}>
                         <TableCell className="font-medium">
                           <div className="space-y-1">
                             <div className="flex items-center gap-2">
                               <span className={mapping.priority === 'essential' ? 'text-red-700 font-semibold' : mapping.priority === 'high' ? 'text-yellow-700' : ''}>
                                 {mapping.schemaField}
                               </span>
                               {mapping.priority === 'essential' && (
                                 <Badge variant="destructive" className="text-xs">Essential</Badge>
                               )}
                               {mapping.priority === 'high' && (
                                 <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">High</Badge>
                               )}
                             </div>
                             {mapping.description && (
                               <div className="text-xs text-muted-foreground">
                                 {mapping.description}
                               </div>
                             )}
                             {autoMapping && (
                               <div className="text-xs text-green-600">
                                 Auto-suggested: {autoMapping[0]} ({Math.round(autoMapping[1].confidence * 100)}%)
                               </div>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           {mapping.required ? (
                             <Badge variant="destructive">Required</Badge>
                           ) : (
                             <Badge variant="outline">Optional</Badge>
                           )}
                         </TableCell>
                         <TableCell>
                            <Select 
                              value={currentMapping || '__none__'} 
                              onValueChange={(value) => handleMappingChange(mapping.schemaField, value)}
                           >
                             <SelectTrigger className="w-full">
                               <SelectValue placeholder="Select column..." />
                             </SelectTrigger>
                                  <SelectContent className="max-h-[200px] bg-background border z-[100]">
                                    <SelectItem value="__none__">-- None --</SelectItem>
                                  {(() => {
                                    console.log('🔍 Field mapping SelectItems debug for:', mapping.schemaField);
                                    console.log('📝 selectedFile object:', {
                                      name: selectedFile?.name,
                                      type: selectedFile?.type,
                                      headers: selectedFile?.headers,
                                      headersType: typeof selectedFile?.headers,
                                      headersIsArray: Array.isArray(selectedFile?.headers),
                                      headersLength: selectedFile?.headers?.length
                                    });
                                    
                                    if (!selectedFile) {
                                      console.error('🚫 No selectedFile available');
                                      return <SelectItem value="__error__" disabled>Error: No file selected</SelectItem>;
                                    }
                                    
                                    if (!selectedFile.headers) {
                                      console.error('🚫 selectedFile has no headers property');
                                      return <SelectItem value="__error__" disabled>Error: No headers found - please re-upload file</SelectItem>;
                                    }
                                    
                                    if (!Array.isArray(selectedFile.headers)) {
                                      console.error('🚫 selectedFile.headers is not an array:', typeof selectedFile.headers);
                                      return <SelectItem value="__error__" disabled>Error: Invalid headers format</SelectItem>;
                                    }
                                    
                                    if (selectedFile.headers.length === 0) {
                                      console.error('🚫 selectedFile.headers is empty array');
                                      return <SelectItem value="__error__" disabled>Error: No columns found - please re-upload file</SelectItem>;
                                    }
                                    
                                    const validHeaders = selectedFile.headers
                                      .filter((header, index) => {
                                        const isValidType = typeof header === 'string';
                                        const isValidContent = isValidType && header.trim() !== '';
                                        
                                        if (!isValidType) {
                                          console.warn(`🚫 Header at index ${index} is not a string:`, header, typeof header);
                                        } else if (!isValidContent) {
                                          console.warn(`🚫 Header at index ${index} is empty:`, header);
                                        }
                                        
                                        return isValidType && isValidContent;
                                      });
                                    
                                    console.log(`✅ Valid headers for "${mapping.schemaField}":`, validHeaders.length, 'out of', selectedFile.headers.length);
                                    
                                    if (validHeaders.length === 0) {
                                      console.error('🚫 No valid headers found after filtering');
                                      return <SelectItem value="__error__" disabled>Error: No valid columns found</SelectItem>;
                                    }
                                    
                                    return validHeaders.map((header, idx) => {
                                      const trimmedValue = header.trim();
                                      if (trimmedValue === '') {
                                        console.warn('🚫 Header trimmed to empty string:', header);
                                        return null;
                                      }
                                      
                                      return (
                                        <SelectItem key={`${trimmedValue}-${idx}`} value={trimmedValue}>
                                          {header}
                                          {autoMapping && autoMapping[0] === header && (
                                            <span className="ml-2 text-xs text-green-600">(Auto)</span>
                                          )}
                                        </SelectItem>
                                      );
                                    }).filter(Boolean);
                                  })()}
                               </SelectContent>
                           </Select>
                         </TableCell>
                       </TableRow>
                     );
                   };
                   
                   return (
                     <>
                       {/* Essential Fields */}
                       {groupedMappings.essential.length > 0 && (
                         <>
                           <TableRow className="bg-red-100 border-b">
                             <TableCell colSpan={3} className="font-bold text-red-800 py-2">
                               ⚡ Essential Fields (Required)
                             </TableCell>
                           </TableRow>
                           {groupedMappings.essential.map((mapping, index) => renderMappingRow(mapping, index))}
                         </>
                       )}
                       
                       {/* High Priority Fields */}
                       {groupedMappings.high.length > 0 && (
                         <>
                           <TableRow className="bg-yellow-100 border-b">
                             <TableCell colSpan={3} className="font-bold text-yellow-800 py-2">
                               ⭐ High Priority Fields (Recommended)
                             </TableCell>
                           </TableRow>
                           {groupedMappings.high.map((mapping, index) => renderMappingRow(mapping, index))}
                         </>
                       )}
                       
                       {/* Secondary Fields */}
                       {groupedMappings.secondary.length > 0 && (
                         <>
                           <TableRow className="bg-gray-100 border-b">
                             <TableCell colSpan={3} className="font-bold text-gray-700 py-2">
                               📊 Secondary Fields (Optional)
                             </TableCell>
                           </TableRow>
                           {groupedMappings.secondary.map((mapping, index) => renderMappingRow(mapping, index))}
                         </>
                       )}
                     </>
                   );
                 })()}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMappingDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => selectedFile && validateMappedFile(selectedFile)}>
                Validate Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };
