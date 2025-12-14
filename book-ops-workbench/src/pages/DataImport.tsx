import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Upload, Check, AlertTriangle, X, FileText, Database, Settings, Download, Plus, Shield, Trash2, CheckCircle, FileSearch, ShieldCheck, GitBranch, Loader2, ChevronRight, Users } from 'lucide-react';
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
import type { Json } from '@/integrations/supabase/types';
import { DataVerification } from '@/components/DataVerification';

// Helper function to save import metadata to Supabase for persistence across refreshes
const saveImportMetadata = async (
  buildId: string,
  dataType: 'accounts' | 'opportunities' | 'sales_reps',
  metadata: {
    importStatus: 'pending' | 'mapped' | 'validated' | 'completed' | 'error';
    totalRows?: number;
    validRows?: number;
    errorCount?: number;
    warningCount?: number;
    fieldMappings?: Record<string, string>;
    autoMappingSummary?: {
      totalMapped: number;
      highConfidence: number;
      mediumConfidence: number;
      lowConfidence: number;
      requiredFieldsMapped: number;
      requiredFieldsTotal: number;
    };
    validationSummary?: {
      totalRows: number;
      validRows: number;
      errorCount: number;
      warningCount: number;
      criticalErrorCount: number;
    };
    originalFilename?: string;
    originalFileSize?: number;
  }
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('import_metadata')
      .upsert({
        build_id: buildId,
        data_type: dataType,
        import_status: metadata.importStatus,
        imported_at: metadata.importStatus === 'completed' ? new Date().toISOString() : null,
        imported_by: user?.id || null,
        total_rows: metadata.totalRows ?? null,
        valid_rows: metadata.validRows ?? null,
        error_count: metadata.errorCount ?? 0,
        warning_count: metadata.warningCount ?? 0,
        field_mappings: (metadata.fieldMappings || {}) as Json,
        auto_mapping_summary: (metadata.autoMappingSummary || null) as Json,
        validation_summary: (metadata.validationSummary || null) as Json,
        original_filename: metadata.originalFilename ?? null,
        original_file_size: metadata.originalFileSize ?? null,
      }, {
        onConflict: 'build_id,data_type'
      });

    if (error) {
      console.error('❌ Failed to save import metadata:', error);
    } else {
      console.log('✅ Import metadata saved for', dataType);
    }
  } catch (error) {
    console.error('❌ Error saving import metadata:', error);
  }
};

// Helper function to load import metadata from Supabase
const loadImportMetadata = async (buildId: string) => {
  try {
    const { data, error } = await supabase
      .from('import_metadata')
      .select('*')
      .eq('build_id', buildId);

    if (error) {
      console.error('❌ Failed to load import metadata:', error);
      return [];
    }

    console.log('✅ Loaded import metadata:', data?.length || 0, 'records');
    return data || [];
  } catch (error) {
    console.error('❌ Error loading import metadata:', error);
    return [];
  }
};

// Helper function to count populated fields from a sample record
const countPopulatedFields = async (
  tableName: 'accounts' | 'opportunities' | 'sales_reps',
  buildId: string
): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('build_id', buildId)
      .limit(1)
      .single();

    if (error || !data) {
      console.warn(`Could not get sample row from ${tableName}`);
      return 0;
    }

    // Count non-null fields (excluding system fields like id, build_id, created_at)
    const systemFields = ['id', 'build_id', 'created_at', 'updated_at'];
    const populatedCount = Object.entries(data).filter(([key, value]) => {
      if (systemFields.includes(key)) return false;
      return value !== null && value !== undefined && value !== '';
    }).length;

    console.log(`📊 ${tableName} has ${populatedCount} populated fields`);
    return populatedCount;
  } catch (error) {
    console.error(`Error counting fields for ${tableName}:`, error);
    return 0;
  }
};
import { DataPreview } from '@/components/DataPreview';
import { EnhancedValidationResults } from '@/components/EnhancedValidationResults';
import { ImportProgressMonitor } from '@/components/ImportProgressMonitor';
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
  _populatedFieldCount?: number; // Count of populated fields from Supabase (fallback when no metadata)
  importProgress?: { processed: number; total: number }; // Track import progress
}

interface FieldMapping {
  csvField: string;
  schemaField: string;
  required: boolean;
  mapped: boolean;
}

interface DataImportProps {
  buildId?: string; // When provided, skip build selector and use this build
  onImportComplete?: (dataType: 'accounts' | 'opportunities' | 'sales_reps') => void | Promise<void>;
  onDataChange?: () => void | Promise<void>; // Called after any data change (import, delete) to trigger refresh
  onContinue?: () => void; // Called when user wants to proceed after import
}

export const DataImport = ({ buildId: propBuildId, onImportComplete, onDataChange, onContinue }: DataImportProps = {}) => {
  const { toast } = useToast();
  const { effectiveProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  // If buildId is provided via props, we're embedded in BuildDetail
  const isEmbedded = !!propBuildId;
  
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
  
  // Start with 'upload' - auto-navigation effect will set correct tab after data loads
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFile, setSelectedFile] = useState<ImportFile | null>(null);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  // Use propBuildId if provided (embedded mode), otherwise use localStorage state
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(() => propBuildId || loadDataImportState.currentBuildId());
  const [availableBuilds, setAvailableBuilds] = useState<Array<{id: string, name: string}>>([]);
  const [isCreatingBuild, setIsCreatingBuild] = useState(false);
  const [newBuildName, setNewBuildName] = useState('');
  const [importingFileIds, setImportingFileIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<ImportFile | null>(null);
  const [errorViewFile, setErrorViewFile] = useState<ImportFile | null>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  
  // Sync with propBuildId when it changes (for embedded mode)
  useEffect(() => {
    if (propBuildId && propBuildId !== currentBuildId) {
      setCurrentBuildId(propBuildId);
    }
  }, [propBuildId]);

  // Persist state changes with error handling
  useEffect(() => {
    // Filter out auto-loaded existing files before persisting to localStorage
    const filesToPersist = files.filter(f => !f.id.startsWith('existing-'));
    console.log('💾 Persisting files to localStorage:', filesToPersist.length, 'files (excluding', files.length - filesToPersist.length, 'existing)');
    try {
      saveDataImportState.files(filesToPersist);
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

  // Track previous build to detect build changes - use 'INITIAL' as sentinel for first render
  const previousBuildIdRef = useRef<string | null | 'INITIAL'>('INITIAL');
  // Track if we've already auto-navigated to the correct tab on initial load
  const hasInitializedTabRef = useRef(false);
  
  // Clear files when switching to a different build
  useEffect(() => {
    const isInitialRender = previousBuildIdRef.current === 'INITIAL';
    const buildChanged = !isInitialRender && previousBuildIdRef.current !== currentBuildId;
    
    if (buildChanged && currentBuildId !== null) {
      console.log('🔄 Build changed from', previousBuildIdRef.current, 'to', currentBuildId, '- clearing files');
      setFiles([]);
      clearDataImportState();
      saveDataImportState.currentBuildId(currentBuildId);
      // Reset tab initialization flag so auto-nav runs for new build
      hasInitializedTabRef.current = false;
    }
    
    // On initial render, if we have files but no matching build, clear them
    if (isInitialRender && files.length > 0 && currentBuildId === null) {
      console.log('🧹 Initial load: clearing orphaned files (no build selected)');
      setFiles([]);
      clearDataImportState();
    }
    
    previousBuildIdRef.current = currentBuildId;
  }, [currentBuildId, files.length]);

  // Debug file state changes
  useEffect(() => {
    console.log('📊 FILES STATE CHANGED:', {
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      timestamp: new Date().toISOString()
    });
  }, [files]);

  // Auto-navigate to appropriate tab based on file state (runs on initial load)
  useEffect(() => {
    // Only run once after initial data load, skip if already initialized
    if (hasInitializedTabRef.current || !currentBuildId) return;
    
    // Wait a tick for files to be populated from Supabase
    const timer = setTimeout(() => {
      if (files.length === 0) {
        // No files yet - stay on upload tab
        console.log('📍 Auto-nav: No files, showing Upload tab');
        setActiveTab('upload');
      } else {
        // Check if all files are completed (imported to Supabase)
        const allCompleted = files.every(f => f.status === 'completed');
        // Check if any files need mapping
        const needsMapping = files.some(f => f.status === 'uploaded');
        // Check if any files are ready for review (validated but not imported)
        const needsReview = files.some(f => f.status === 'validated' || f.status === 'mapped');
        
        if (allCompleted) {
          console.log('📍 Auto-nav: All files completed, showing Review tab');
          setActiveTab('review');
        } else if (needsReview) {
          console.log('📍 Auto-nav: Files need review, showing Review tab');
          setActiveTab('review');
        } else if (needsMapping) {
          console.log('📍 Auto-nav: Files need mapping, showing Mapping tab');
          setActiveTab('mapping');
        } else {
          console.log('📍 Auto-nav: Default to Upload tab');
          setActiveTab('upload');
        }
      }
      hasInitializedTabRef.current = true;
    }, 100); // Small delay to let Supabase data load

    return () => clearTimeout(timer);
  }, [files, currentBuildId]);

  // Prevent accidental refresh/close during active import
  const isImporting = files.some(f => f.status === 'validating');
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isImporting) {
        e.preventDefault();
        e.returnValue = 'Import in progress! Are you sure you want to leave? Your import will be interrupted.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isImporting]);
  
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
    
    // Get user's region for filtering
    const userRegion = effectiveProfile?.region;
    
    let query = supabase
      .from('builds')
      .select('id, name, region')
      .order('created_at', { ascending: false });
    
    // Filter by region unless user is REVOPS (REVOPS sees all)
    if (userRegion && effectiveProfile?.role !== 'REVOPS') {
      query = query.eq('region', userRegion);
    }
    
    const { data, error } = await query;
    
    if (!error && data) {
      console.log('✅ Builds loaded:', data.length);
      setAvailableBuilds(data);
      
      // Check if stored currentBuildId is still valid
      if (currentBuildId) {
        const buildExists = data.some(b => b.id === currentBuildId);
        if (!buildExists) {
          console.log('🧹 Stored build ID no longer exists, clearing files and resetting');
          setFiles([]);
          clearDataImportState();
          // Set to first available build or null
          if (data.length > 0) {
            setCurrentBuildId(data[0].id);
          } else {
            setCurrentBuildId(null);
          }
          return;
        }
      }
      
      // Set default build if none selected
      if (data.length > 0 && !currentBuildId) {
        console.log('🎯 Setting default build:', data[0].name);
        setCurrentBuildId(data[0].id);
      }
    } else {
      console.error('❌ Failed to load builds:', error);
    }
  }, [currentBuildId, effectiveProfile]);

  // Load existing imported data from Supabase to show in "Uploaded Files" table
  useEffect(() => {
    const loadExistingData = async () => {
      if (!currentBuildId) return;

      console.log('🔍 Checking for existing imported data in build:', currentBuildId);

      try {
        // Check what data exists in Supabase for this build AND load import metadata
        const [accountsRes, oppsRes, repsRes, metadataRes] = await Promise.all([
          supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('build_id', currentBuildId),
          supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('build_id', currentBuildId),
          supabase.from('sales_reps').select('id', { count: 'exact', head: true }).eq('build_id', currentBuildId),
          loadImportMetadata(currentBuildId)
        ]);

        // Create a map of metadata by data type for easy lookup
        const metadataByType: Record<string, any> = {};
        if (Array.isArray(metadataRes)) {
          metadataRes.forEach((meta: any) => {
            metadataByType[meta.data_type] = meta;
          });
        }
        console.log('📋 Import metadata by type:', Object.keys(metadataByType));

        // Count populated fields for each data type that exists (fallback when no metadata)
        const fieldCounts: Record<string, number> = {};
        const fieldCountPromises: Promise<void>[] = [];
        
        if (accountsRes.count && accountsRes.count > 0 && !metadataByType['accounts']?.field_mappings) {
          fieldCountPromises.push(
            countPopulatedFields('accounts', currentBuildId).then(count => { fieldCounts['accounts'] = count; })
          );
        }
        if (oppsRes.count && oppsRes.count > 0 && !metadataByType['opportunities']?.field_mappings) {
          fieldCountPromises.push(
            countPopulatedFields('opportunities', currentBuildId).then(count => { fieldCounts['opportunities'] = count; })
          );
        }
        if (repsRes.count && repsRes.count > 0 && !metadataByType['sales_reps']?.field_mappings) {
          fieldCountPromises.push(
            countPopulatedFields('sales_reps', currentBuildId).then(count => { fieldCounts['sales_reps'] = count; })
          );
        }
        
        await Promise.all(fieldCountPromises);
        console.log('📊 Field counts from data:', fieldCounts);

        const existingFiles: ImportFile[] = [];

        // Add accounts if they exist
        if (accountsRes.count && accountsRes.count > 0) {
          const meta = metadataByType['accounts'];
          const mappedFieldCount = meta?.field_mappings ? Object.keys(meta.field_mappings).length : fieldCounts['accounts'] || 0;
          existingFiles.push({
            id: 'existing-accounts',
            name: meta?.original_filename || 'Accounts',
            type: 'accounts',
            size: meta?.original_file_size || 0,
            data: [],
            headers: [],
            rowCount: accountsRes.count,
            validRows: meta?.valid_rows || accountsRes.count,
            errorCount: meta?.error_count || 0,
            warningCount: meta?.warning_count || 0,
            status: 'completed',
            fieldMappings: meta?.field_mappings || {},
            // Store the field count for display
            _populatedFieldCount: mappedFieldCount,
            autoMappingSummary: meta?.auto_mapping_summary || undefined,
            validationResult: meta?.validation_summary ? {
              totalRows: meta.validation_summary.totalRows || accountsRes.count,
              validRows: meta.validation_summary.validRows || accountsRes.count,
              validData: [],
              errors: [],
              warnings: [],
              criticalErrors: []
            } : {
              totalRows: accountsRes.count,
              validRows: accountsRes.count,
              validData: [],
              errors: [],
              warnings: [],
              criticalErrors: []
            }
          });
          console.log(`✅ Found ${accountsRes.count} accounts in Supabase with ${mappedFieldCount} fields`);
        }

        // Add opportunities if they exist
        if (oppsRes.count && oppsRes.count > 0) {
          const meta = metadataByType['opportunities'];
          const mappedFieldCount = meta?.field_mappings ? Object.keys(meta.field_mappings).length : fieldCounts['opportunities'] || 0;
          existingFiles.push({
            id: 'existing-opportunities',
            name: meta?.original_filename || 'Opportunities',
            type: 'opportunities',
            size: meta?.original_file_size || 0,
            data: [],
            headers: [],
            rowCount: oppsRes.count,
            validRows: meta?.valid_rows || oppsRes.count,
            errorCount: meta?.error_count || 0,
            warningCount: meta?.warning_count || 0,
            status: 'completed',
            fieldMappings: meta?.field_mappings || {},
            // Store the field count for display
            _populatedFieldCount: mappedFieldCount,
            autoMappingSummary: meta?.auto_mapping_summary || undefined,
            validationResult: meta?.validation_summary ? {
              totalRows: meta.validation_summary.totalRows || oppsRes.count,
              validRows: meta.validation_summary.validRows || oppsRes.count,
              validData: [],
              errors: [],
              warnings: [],
              criticalErrors: []
            } : {
              totalRows: oppsRes.count,
              validRows: oppsRes.count,
              validData: [],
              errors: [],
              warnings: [],
              criticalErrors: []
            }
          });
          console.log(`✅ Found ${oppsRes.count} opportunities in Supabase with ${mappedFieldCount} fields`);
        }

        // Add sales reps if they exist
        if (repsRes.count && repsRes.count > 0) {
          const meta = metadataByType['sales_reps'];
          const mappedFieldCount = meta?.field_mappings ? Object.keys(meta.field_mappings).length : fieldCounts['sales_reps'] || 0;
          existingFiles.push({
            id: 'existing-sales-reps',
            name: meta?.original_filename || 'Sales Reps',
            type: 'sales_reps',
            size: meta?.original_file_size || 0,
            data: [],
            headers: [],
            rowCount: repsRes.count,
            validRows: meta?.valid_rows || repsRes.count,
            errorCount: meta?.error_count || 0,
            warningCount: meta?.warning_count || 0,
            status: 'completed',
            fieldMappings: meta?.field_mappings || {},
            // Store the field count for display
            _populatedFieldCount: mappedFieldCount,
            autoMappingSummary: meta?.auto_mapping_summary || undefined,
            validationResult: meta?.validation_summary ? {
              totalRows: meta.validation_summary.totalRows || repsRes.count,
              validRows: meta.validation_summary.validRows || repsRes.count,
              validData: [],
              errors: [],
              warnings: [],
              criticalErrors: []
            } : {
              totalRows: repsRes.count,
              validRows: repsRes.count,
              validData: [],
              errors: [],
              warnings: [],
              criticalErrors: []
            }
          });
          console.log(`✅ Found ${repsRes.count} sales reps in Supabase with ${mappedFieldCount} fields`);
        }

        // Merge Supabase data with localStorage files, replacing CSV files with Supabase entries
        if (existingFiles.length > 0) {
          setFiles(prev => {
            // Remove CSV files for types that now exist in Supabase
            const typesInSupabase = new Set(existingFiles.map(f => f.type));
            const filteredPrev = prev.filter(file => {
              // Keep files that aren't in Supabase yet (not imported)
              const shouldKeep = !typesInSupabase.has(file.type);
              if (!shouldKeep) {
                console.log(`🔄 Replacing CSV file "${file.name}" with Supabase data for ${file.type}`);
              }
              return shouldKeep;
            });

            // Add Supabase entries (using generic names like "Accounts", not CSV filenames)
            const newFiles = existingFiles.filter(
              newFile => !filteredPrev.some(existingFile => existingFile.id === newFile.id)
            );

            if (newFiles.length > 0) {
              console.log(`📊 Adding ${newFiles.length} Supabase data entries to UI`);
              return [...filteredPrev, ...newFiles];
            }

            return filteredPrev;
          });
          
          // Auto-navigate to Review tab if imports are already completed
          const allCompleted = existingFiles.every(f => f.status === 'completed');
          if (allCompleted && existingFiles.length > 0) {
            console.log('✅ All imports completed - auto-navigating to Review tab');
            setActiveTab('review');
          }
        }

      } catch (error) {
        console.error('❌ Error loading existing data:', error);
      }
    };

    loadExistingData();
  }, [currentBuildId]); // Removed files.length dependency to prevent re-running on file updates

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

      // Use user's region or default to GLOBAL
      const userRegion = effectiveProfile?.region || 'GLOBAL';
      
      const { data, error } = await supabase
        .from('builds')
        .insert([{
          name: newBuildName.trim(),
          description: `Build created from Import page - ${new Date().toLocaleDateString()}`,
          status: 'DRAFT',
          region: userRegion,
          created_by: user.id
        }])
        .select('id, name, region')
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
    
    // High priority fields - Important for territory assignment and revenue tracking (but not blocking)
    { csvField: '', schemaField: 'owner_id', required: false, mapped: false, priority: 'high', description: 'Account owner user ID' },
    { csvField: '', schemaField: 'owner_name', required: false, mapped: false, priority: 'high', description: 'Account owner full name' },
    { csvField: '', schemaField: 'ultimate_parent_id', required: false, mapped: false, priority: 'high', description: 'Ultimate parent account ID for hierarchy (empty for parent accounts)' },
    { csvField: '', schemaField: 'ultimate_parent_name', required: false, mapped: false, priority: 'high', description: 'Ultimate parent account name (empty for parent accounts)' },
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
    { csvField: '', schemaField: 'cre_risk', required: false, mapped: false, priority: 'secondary', description: 'Customer Risk & Expansion flag' },
    { csvField: '', schemaField: 'pe_firm', required: false, mapped: false, priority: 'secondary', description: 'Private Equity firm name (for PE routing rules)' }
  ]);

  // Opportunity field mappings optimized for pipeline and revenue tracking
  const [opportunityMappings] = useState<PriorityFieldMapping[]>([
    // Essential fields - Required for basic opportunity tracking
    { csvField: '', schemaField: 'sfdc_opportunity_id', required: true, mapped: false, priority: 'essential', description: 'Unique Salesforce Opportunity ID' },
    { csvField: '', schemaField: 'sfdc_account_id', required: true, mapped: false, priority: 'essential', description: 'Related Account ID' },
    
    // High priority fields - Important for pipeline management (but not blocking)
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
    // Note: rep_id is optional - if blank, a placeholder ID will be auto-generated (Open Headcount)
    { csvField: '', schemaField: 'rep_id', required: false, mapped: false, priority: 'essential', description: 'Unique sales rep identifier (User ID). Leave blank for open headcount - ID will be auto-generated.' },
    { csvField: '', schemaField: 'name', required: true, mapped: false, priority: 'essential', description: 'Sales representative full name' },
    
    // High priority fields - Important for territory assignment and hierarchy (but not blocking)
    { csvField: '', schemaField: 'team', required: false, mapped: false, priority: 'high', description: 'Sales team assignment' },
    { csvField: '', schemaField: 'flm', required: false, mapped: false, priority: 'high', description: 'First Level Manager' },
    { csvField: '', schemaField: 'slm', required: false, mapped: false, priority: 'high', description: 'Second Level Manager' },
    { csvField: '', schemaField: 'region', required: false, mapped: false, priority: 'high', description: 'Geographic region assignment' },
    
    // Secondary fields - Optional/legacy and backfill support
    { csvField: '', schemaField: 'manager', required: false, mapped: false, priority: 'secondary', description: 'Legacy manager field (use FLM/SLM instead)' },
    { csvField: '', schemaField: 'is_backfill_source', required: false, mapped: false, priority: 'secondary', description: 'Mark rep as leaving (backfill source). Set to TRUE to exclude from assignments.' }
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
      // Check authentication status
      const { data: { session } } = await supabase.auth.getSession();
      console.log('🔐 Auth session:', session ? 'Active' : 'No session');
      console.log('👤 User ID:', session?.user?.id);
      console.log('📧 User email:', session?.user?.email);

      // Delete the actual data from Supabase based on file type
      if (fileToDelete.type === 'accounts') {
        console.log('🗑️ Deleting accounts from Supabase for build:', currentBuildId);
        const { error, count } = await supabase
          .from('accounts')
          .delete({ count: 'exact' })
          .eq('build_id', currentBuildId);

        if (error) {
          console.error('❌ Error deleting accounts:', error);
          throw error;
        }
        console.log('✅ Accounts deleted from Supabase. Count:', count);

      } else if (fileToDelete.type === 'opportunities') {
        console.log('🗑️ Deleting opportunities from Supabase for build:', currentBuildId);
        const { error, count } = await supabase
          .from('opportunities')
          .delete({ count: 'exact' })
          .eq('build_id', currentBuildId);

        if (error) {
          console.error('❌ Error deleting opportunities:', error);
          throw error;
        }
        console.log('✅ Opportunities deleted from Supabase. Count:', count);

      } else if (fileToDelete.type === 'sales_reps') {
        console.log('🗑️ Deleting sales reps from Supabase for build:', currentBuildId);
        const { error, count } = await supabase
          .from('sales_reps')
          .delete({ count: 'exact' })
          .eq('build_id', currentBuildId);

        if (error) {
          console.error('❌ Error deleting sales reps:', error);
          throw error;
        }
        console.log('✅ Sales reps deleted from Supabase. Count:', count);
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

      // Trigger data refresh in parent component and local DataVerification
      await onDataChange?.();
      setDataRefreshKey(prev => prev + 1);

    } catch (error) {
      console.error('💥 Error deleting file data:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete data from database",
        variant: "destructive"
      });
    }
  }, [files, selectedFile?.id, currentBuildId, toast, onDataChange]);

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
      
      setActiveTab('review');
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
    
    // Prevent importing the same file twice
    if (importingFileIds.has(file.id)) {
      console.log('⏳ This file is already being imported, ignoring click');
      return;
    }
    
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
    setImportingFileIds(prev => new Set(prev).add(file.id));
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

      // Clear importing state for this file
      setImportingFileIds(prev => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });

      if (result.success) {
        // Notify parent component that import is complete (for auto-refresh)
        await onImportComplete?.(file.type);
        await onDataChange?.(); // Trigger general data refresh
        
        // Clear the build count cache so Data Verification shows fresh data
        const { buildCountService } = await import('@/services/buildCountService');
        buildCountService.clearBuildCache(currentBuildId);
        console.log('🧹 Cleared build count cache after successful import');

        // Save import metadata to Supabase for persistence across refreshes
        await saveImportMetadata(currentBuildId, file.type, {
          importStatus: 'completed',
          totalRows: file.validationResult?.totalRows || result.recordsProcessed,
          validRows: result.recordsImported,
          errorCount: result.errors.length,
          warningCount: file.validationResult?.warnings?.length || 0,
          fieldMappings: file.fieldMappings || {},
          autoMappingSummary: file.autoMappingSummary,
          validationSummary: file.validationResult ? {
            totalRows: file.validationResult.totalRows,
            validRows: file.validationResult.validRows,
            errorCount: file.validationResult.errors?.length || 0,
            warningCount: file.validationResult.warnings?.length || 0,
            criticalErrorCount: file.validationResult.criticalErrors?.length || 0,
          } : undefined,
          originalFilename: file.name,
          originalFileSize: file.size,
        });

        toast({
          title: "Import Completed",
          description: `Successfully imported ${result.recordsImported} of ${result.recordsProcessed} records to build "${buildExists.name}". Database shows ${actualDatabaseCount} total records.`,
        });

        // Switch to review tab to show user their data is ready
        setTimeout(() => {
          setActiveTab('review');
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
        setActiveTab('review');
      }
    } catch (error) {
      console.error('Import failed:', error);
      // Clear importing state for this file on error
      setImportingFileIds(prev => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
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
        return <Users className="w-4 h-4" />;
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

  // Check if all three CSV types have been imported (completed status)
  const allCSVsImported = useMemo(() => {
    if (!currentBuildId) return false;
    const completedFiles = files.filter(f => f.status === 'completed');
    const hasAccounts = completedFiles.some(f => f.type === 'accounts');
    const hasSalesReps = completedFiles.some(f => f.type === 'sales_reps');
    // Opportunities are optional - only require accounts + sales reps
    return hasAccounts && hasSalesReps;
  }, [files, currentBuildId]);

  // Calculate total records from completed files
  const totalRecords = useMemo(() => {
    const completedFiles = files.filter(f => f.status === 'completed');
    return completedFiles.reduce((sum, file) => {
      return sum + (file.validRows || file.rowCount || 0);
    }, 0);
  }, [files]);

  const handleNavigateToBuild = () => {
    if (currentBuildId) {
      navigate(`/build/${currentBuildId}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header - Only show when NOT embedded in BuildDetail */}
      {!isEmbedded && (
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
      )}

      {/* Build Selection - Only show when NOT embedded in BuildDetail */}
      {!isEmbedded && (
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
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Build Selection Required</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    Please select a build to associate your imported data with.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}


      {/* Status Bar - Show when all three CSV files are imported */}
      {allCSVsImported && currentBuildId && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div>
                <div className="text-3xl font-bold text-primary mb-2">
                  {totalRecords.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">
                  Total Records Ready for Book Building
                </div>
              </div>
              <div className="flex justify-center">
                <Button 
                  onClick={onContinue || handleNavigateToBuild} 
                  className="flex items-center gap-2"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Progress Steps Navigation - Arrow Design */}
        <div className="mb-4">
          <div className="flex items-stretch gap-0.5 relative">
            {[
              { value: 'upload', icon: Upload, label: 'Upload', step: 1 },
              { value: 'mapping', icon: GitBranch, label: 'Map Fields', step: 2 },
              { value: 'review', icon: CheckCircle, label: 'Review & Import', step: 3 },
            ].map((tab, index, arr) => {
              const tabOrder = ['upload', 'mapping', 'review'];
              const currentTabIndex = tabOrder.indexOf(activeTab);
              const isActive = activeTab === tab.value;
              const isCompleted = index < currentTabIndex;
              const isLast = index === arr.length - 1;
              const Icon = tab.icon;
              
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`
                    relative flex-1 flex items-center justify-center gap-2 py-3 px-3 transition-all duration-300
                    ${isActive 
                      ? 'bg-primary text-primary-foreground shadow-md' 
                      : isCompleted 
                        ? 'bg-primary/20 text-primary hover:bg-primary/30' 
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                    }
                    ${index === 0 ? 'rounded-l-md' : ''}
                    ${isLast ? 'rounded-r-md' : ''}
                  `}
                  style={{
                    clipPath: isLast 
                      ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 6px 50%)' 
                      : index === 0 
                        ? 'polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%)'
                        : 'polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%, 6px 50%)'
                  }}
                >
                  {/* Step indicator */}
                  <span className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                    ${isActive 
                      ? 'bg-primary-foreground/20 text-primary-foreground' 
                      : isCompleted
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted-foreground/20 text-muted-foreground'
                    }
                  `}>
                    {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : tab.step}
                  </span>
                  
                  {/* Icon and Label */}
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="font-medium text-sm truncate hidden md:block">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Hidden TabsList for accessibility */}
        <TabsList className="hidden">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="mapping">Map Fields</TabsTrigger>
          <TabsTrigger value="review">Review & Import</TabsTrigger>
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
                <CardDescription className="min-h-[3rem]">
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
                <CardDescription className="min-h-[3rem]">
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
                  <Users className="w-5 h-5" />
                  Sales Reps CSV
                </CardTitle>
                <CardDescription className="min-h-[3rem]">
                  Upload sales representative data with Name, Manager, Team, Region, and Rep ID
                </CardDescription>
                <div className="mt-2 space-y-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-help hover:text-foreground transition-colors">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-gray-50 dark:bg-gray-800">Open Headcount</Badge>
                        <span>Leave User ID blank for new hires</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[280px]">
                      <p className="text-xs"><strong>Open Headcount:</strong> For new hires without a Salesforce ID yet, leave the User ID field blank. A placeholder ID will be auto-generated. Ensure the rep name is unique.</p>
                    </TooltipContent>
                  </Tooltip>
                  <br />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-help hover:text-foreground transition-colors">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Backfill</Badge>
                        <span>Mark departing reps in the Reps tab</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[280px]">
                      <p className="text-xs"><strong>Backfill Reps:</strong> For reps leaving the business, mark them as "Leaving" in the Reps tab after import. This will auto-create a replacement rep and migrate their accounts.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Drag & drop or click to upload
                  </p>
                  <div className="space-y-2">
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
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full"
                      onClick={() => downloadSampleFile('sales_reps')}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Download Sample
                    </Button>
                  </div>
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
                            <Button 
                              size="sm" 
                              onClick={() => handleValidateAndImport(file)}
                              disabled={importingFileIds.has(file.id)}
                            >
                              {importingFileIds.has(file.id) ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
                              ) : 'Import Data'}
                            </Button>
                          )}
                          {(file.status === 'warning') && (
                            <Button 
                              size="sm" 
                              onClick={() => handleValidateAndImport(file)}
                              disabled={importingFileIds.has(file.id)}
                            >
                              {importingFileIds.has(file.id) ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
                              ) : 'Import Valid Data'}
                            </Button>
                          )}
                          {file.status === 'error' && (
                            <Button size="sm" variant="outline" onClick={() => setErrorViewFile(file)}>
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
              {files.filter(f => f.status !== 'validating').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Files Ready for Mapping</h3>
                  <p>Upload files first to begin field mapping.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {files.filter(f => f.status !== 'validating').map(file => (
                    <div key={file.id} className={`border rounded-lg p-4 ${file.status === 'completed' ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : ''}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getFileTypeIcon(file.type)}
                          <span className="font-medium">{file.name}</span>
                          {getStatusBadge(file.status)}
                        </div>
                        <div className="flex gap-2">
                          {/* Only show edit controls for non-completed files */}
                          {file.status !== 'completed' && (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Show completed import summary - simplified */}
                      {file.status === 'completed' && (
                        <div className="mb-2 p-2 bg-muted/30 rounded border border-muted">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Check className="w-3 h-3 text-green-600" />
                              <span className="text-muted-foreground">Import completed</span>
                            </div>
                            <span className="font-medium">{file.rowCount?.toLocaleString() || 0} records</span>
                          </div>
                        </div>
                      )}

                      {/* Auto-mapping summary for non-completed files */}
                      {file.status !== 'completed' && file.autoMappingSummary && (
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
                      
                      {file.status !== 'completed' && (
                        <p className="text-sm text-muted-foreground">
                          {Object.keys(file.fieldMappings || {}).length} of {getCurrentMappings(file.type).length} fields mapped
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Review & Import Tab - Combined Validation + Verification */}
        <TabsContent value="review" className="space-y-4">
          {/* Check for missing REQUIRED data types (accounts + sales reps) and show go-back prompt */}
          {(() => {
            const uploadedTypes = files.map(f => f.type);
            // Only accounts and sales reps are required - opportunities are optional
            const requiredTypes = ['accounts', 'sales_reps'] as const;
            const missingTypes = requiredTypes.filter(t => !uploadedTypes.includes(t));
            
            if (missingTypes.length > 0 && files.some(f => f.validationResult || f.status === 'validated' || f.status === 'mapped')) {
              const typeLabels: Record<string, string> = {
                accounts: 'Accounts',
                sales_reps: 'Sales Reps'
              };
              
              return (
                <div className="relative overflow-hidden rounded-xl border-2 border-primary/30 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-5 animate-pulse-subtle">
                  {/* Subtle glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-shimmer" />
                  
                  <div className="relative flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Upload className="h-5 w-5 text-primary animate-bounce-subtle" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          Almost there! Just need {missingTypes.map(t => typeLabels[t]).join(' and ')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Upload the remaining files to continue
                        </p>
                      </div>
                    </div>
                    <Button 
                      size="lg"
                      className="shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 bg-primary hover:bg-primary/90"
                      onClick={() => setActiveTab('upload')}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Continue Upload
                    </Button>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Validation Results for uploaded files */}
          {files.filter(f => f.validationResult || f.status === 'completed').length > 0 && (
            <div className="space-y-4">
              {files.filter(f => f.validationResult || f.status === 'completed').map(file => (
                <div key={file.id}>
                  {/* Show completed import summary for existing data */}
                  {file.status === 'completed' && file.id.startsWith('existing-') && (
                    <Card className="border-green-200 dark:border-green-800">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`flex items-center gap-1 font-medium ${
                              file.type === 'accounts' ? 'text-blue-500' :
                              file.type === 'opportunities' ? 'text-purple-500' :
                              file.type === 'sales_reps' ? 'text-green-500' : 'text-muted-foreground'
                            }`}>
                              {getFileTypeIcon(file.type)}
                              <span>{file.type === 'accounts' ? 'Accounts' : file.type === 'opportunities' ? 'Opportunities' : file.type === 'sales_reps' ? 'Sales Reps' : file.type}</span>
                            </div>
                            <span className="text-muted-foreground">{file.name}</span>
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              <Check className="w-3 h-3 mr-1" />
                              Imported
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">
                              {file.validRows?.toLocaleString() || file.rowCount?.toLocaleString() || 0} records
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => setPreviewFile(file)}
                                    disabled={!file.parsedData}
                                  >
                                    <FileSearch className="w-4 h-4 mr-1" />
                                    Preview
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {!file.parsedData && (
                                <TooltipContent>
                                  <p>Preview unavailable - data already in database</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDeleteFile(file.id)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Show validation for fresh uploads */}
                  {file.validationResult && !file.id.startsWith('existing-') && (
                    <EnhancedValidationResults
                      file={file}
                      onImport={handleValidateAndImport}
                      onDownloadErrorReport={handleDownloadErrorReport}
                      onReconfigureMapping={() => setActiveTab('mapping')}
                      onPreview={(f) => setPreviewFile(f)}
                      onDelete={(f) => handleDeleteFile(f.id)}
                      onViewErrors={(f) => setErrorViewFile(f)}
                      isImporting={importingFileIds.has(file.id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Data Verification */}
          {currentBuildId && (
            <DataVerification 
              key={`verification-${dataRefreshKey}`}
              buildId={currentBuildId} 
              buildName={availableBuilds.find(b => b.id === currentBuildId)?.name || 'Current Build'}
              onGoToUpload={() => setActiveTab('upload')}
            />
          )}

          {/* Empty state */}
          {files.filter(f => f.validationResult || f.status === 'completed').length === 0 && !currentBuildId && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <FileSearch className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Data to Review</h3>
                  <p>Upload files and complete field mapping first</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

      </Tabs>

      {/* Data Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Preview - {previewFile?.name}
            </DialogTitle>
            <DialogDescription>
              Showing sample data from your {previewFile?.type?.replace('_', ' ')} file
            </DialogDescription>
          </DialogHeader>
          
          {previewFile?.parsedData && previewFile?.headers ? (
            <div className="flex-1 overflow-auto">
              <DataPreview 
                data={previewFile.parsedData}
                headers={previewFile.headers}
                fileName={previewFile.name}
                fileType={previewFile.type}
                fieldMappings={previewFile.fieldMappings}
              />
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">Preview Not Available</h3>
              <p>Data was not cached in memory. Re-upload the file to preview.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Error Viewing Dialog */}
      <Dialog open={!!errorViewFile} onOpenChange={(open) => !open && setErrorViewFile(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Validation Errors - {errorViewFile?.name}
            </DialogTitle>
            <DialogDescription>
              {errorViewFile?.validationResult && (
                <>
                  {errorViewFile.validationResult.criticalErrors?.length || 0} critical errors, {' '}
                  {errorViewFile.validationResult.errors?.length || 0} errors, {' '}
                  {errorViewFile.validationResult.warnings?.length || 0} warnings
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4 py-4">
            {errorViewFile?.validationResult?.criticalErrors && errorViewFile.validationResult.criticalErrors.length > 0 && (
              <div>
                <h4 className="font-semibold text-destructive mb-2">Critical Errors (Blocking Import)</h4>
                <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 max-h-48 overflow-y-auto">
                  <ul className="text-sm space-y-1">
                    {errorViewFile.validationResult.criticalErrors.slice(0, 50).map((error, i) => (
                      <li key={i} className="text-destructive">{error}</li>
                    ))}
                    {errorViewFile.validationResult.criticalErrors.length > 50 && (
                      <li className="text-muted-foreground italic">
                        ... and {errorViewFile.validationResult.criticalErrors.length - 50} more critical errors
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
            {errorViewFile?.validationResult?.errors && errorViewFile.validationResult.errors.length > 0 && (
              <div>
                <h4 className="font-semibold text-orange-500 mb-2">Errors</h4>
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-md p-3 max-h-48 overflow-y-auto">
                  <ul className="text-sm space-y-1">
                    {errorViewFile.validationResult.errors.slice(0, 50).map((error, i) => (
                      <li key={i} className="text-orange-500">{error}</li>
                    ))}
                    {errorViewFile.validationResult.errors.length > 50 && (
                      <li className="text-muted-foreground italic">
                        ... and {errorViewFile.validationResult.errors.length - 50} more errors
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
            {errorViewFile?.validationResult?.warnings && errorViewFile.validationResult.warnings.length > 0 && (
              <div>
                <h4 className="font-semibold text-yellow-500 mb-2">Warnings</h4>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 max-h-48 overflow-y-auto">
                  <ul className="text-sm space-y-1">
                    {errorViewFile.validationResult.warnings.slice(0, 50).map((warning, i) => (
                      <li key={i} className="text-yellow-600">{warning}</li>
                    ))}
                    {errorViewFile.validationResult.warnings.length > 50 && (
                      <li className="text-muted-foreground italic">
                        ... and {errorViewFile.validationResult.warnings.length - 50} more warnings
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
            {(!errorViewFile?.validationResult || 
              ((!errorViewFile.validationResult.criticalErrors || errorViewFile.validationResult.criticalErrors.length === 0) &&
               (!errorViewFile.validationResult.errors || errorViewFile.validationResult.errors.length === 0) &&
               (!errorViewFile.validationResult.warnings || errorViewFile.validationResult.warnings.length === 0))) && (
              <div className="text-center text-muted-foreground py-8">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No detailed error information available.</p>
                <p className="text-sm mt-2">Try re-uploading and validating the file.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => errorViewFile && handleDownloadErrorReport(errorViewFile)}>
              Download Error Report
            </Button>
            <Button onClick={() => setErrorViewFile(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                       <TableRow key={`${mapping.priority}-${index}`} className={mapping.priority === 'essential' ? 'bg-red-50/50 dark:bg-red-950/20' : mapping.priority === 'high' ? 'bg-yellow-50/50 dark:bg-yellow-950/20' : ''}>
                         <TableCell className="font-medium">
                           <div className="space-y-1">
                             <div className="flex items-center gap-2">
                               <span className={mapping.priority === 'essential' ? 'text-red-700 dark:text-red-400 font-semibold' : mapping.priority === 'high' ? 'text-yellow-700 dark:text-yellow-400' : ''}>
                                 {mapping.schemaField}
                               </span>
                               {mapping.priority === 'essential' && (
                                 <Badge variant="destructive" className="text-xs">Essential</Badge>
                               )}
                               {mapping.priority === 'high' && (
                                 <Badge variant="secondary" className="text-xs bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300">High</Badge>
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
                          <TableRow className="bg-red-100 dark:bg-red-950/30 border-b">
                            <TableCell colSpan={3} className="font-bold text-red-800 dark:text-red-300 py-2">
                              ⚡ Essential Fields (Required)
                            </TableCell>
                          </TableRow>
                           {groupedMappings.essential.map((mapping, index) => renderMappingRow(mapping, index))}
                         </>
                       )}
                       
                       {/* High Priority Fields */}
                       {groupedMappings.high.length > 0 && (
                         <>
                          <TableRow className="bg-yellow-100 dark:bg-yellow-950/30 border-b">
                            <TableCell colSpan={3} className="font-bold text-yellow-800 dark:text-yellow-300 py-2">
                              ⭐ High Priority Fields (Recommended)
                            </TableCell>
                          </TableRow>
                           {groupedMappings.high.map((mapping, index) => renderMappingRow(mapping, index))}
                         </>
                       )}
                       
                       {/* Secondary Fields */}
                       {groupedMappings.secondary.length > 0 && (
                         <>
                          <TableRow className="bg-muted/50 border-b">
                            <TableCell colSpan={3} className="font-bold py-2">
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
