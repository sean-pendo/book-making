// Utility functions for managing localStorage persistence in DataImport

const STORAGE_KEYS = {
  FILES: 'dataImport_files',
  ACTIVE_TAB: 'dataImport_activeTab', 
  CURRENT_BUILD_ID: 'dataImport_currentBuildId',
} as const;

export const clearDataImportState = () => {
  console.log('🧹 Clearing DataImport localStorage state');
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
};

export const saveDataImportState = {
  files: (files: any[]) => {
    try {
      // Create an ultra-lightweight version of files for storage
      const lightweightFiles = files.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        status: file.status,
        rowCount: file.rowCount,
        validRows: file.validRows,
        errorCount: file.errorCount,
        warningCount: file.warningCount,
        // Keep only essential headers info, limit to first 50 headers max
        headers: file.headers ? file.headers.slice(0, 50) : undefined,
        // Keep only field mappings, not the actual data
        fieldMappings: file.fieldMappings,
        // Keep only summary info, no actual data
        autoMappingSummary: file.autoMappingSummary,
        // Remove all bulk data completely
        data: undefined,
        parsedData: undefined,
        validationResult: file.validationResult ? {
          totalRows: file.validationResult.totalRows,
          validRows: file.validationResult.validRows,
          // Keep only error/warning counts and first few messages
          errors: file.validationResult.errors ? file.validationResult.errors.slice(0, 10) : [],
          warnings: file.validationResult.warnings ? file.validationResult.warnings.slice(0, 10) : [],
          criticalErrors: file.validationResult.criticalErrors ? file.validationResult.criticalErrors.slice(0, 10) : [],
          validData: undefined // Remove all actual data
        } : undefined,
        importResult: file.importResult ? {
          success: file.importResult.success,
          totalProcessed: file.importResult.totalProcessed,
          successCount: file.importResult.successCount,
          errorCount: file.importResult.errorCount,
          // Keep only summary, no detailed records
          errors: file.importResult.errors ? file.importResult.errors.slice(0, 5) : []
        } : undefined
      }));
      
      const dataString = JSON.stringify(lightweightFiles);
      
      // Additional size check before storing
      if (dataString.length > 4000000) { // ~4MB limit for safety
        console.warn('🚫 File data still too large after reduction. Storing only essential info.');
        
        // Ultra minimal version - just status info
        const minimalFiles = files.map(file => ({
          id: file.id,
          name: file.name,
          type: file.type,
          status: file.status,
          errorCount: file.errorCount || 0,
          warningCount: file.warningCount || 0
        }));
        
        localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify(minimalFiles));
      } else {
        localStorage.setItem(STORAGE_KEYS.FILES, dataString);
      }
    } catch (error) {
      console.error('Failed to save files to localStorage:', error);
      
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('🚫 LocalStorage quota exceeded. Clearing import state completely.');
        
        // Clear all data import state to free up space
        clearDataImportState();
        
        // Show user-friendly error (this will be caught by the component)
        throw new Error('Storage quota exceeded. Import state has been reset. Please re-upload your files.');
      }
      
      // Re-throw other errors
      throw error;
    }
  },
  activeTab: (tab: string) => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, tab);
    } catch (error) {
      console.error('Failed to save active tab:', error);
    }
  },
  currentBuildId: (buildId: string) => {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_BUILD_ID, buildId);
    } catch (error) {
      console.error('Failed to save current build ID:', error);
    }
  }
};

export const loadDataImportState = {
  files: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FILES);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('Failed to load files from localStorage:', error);
      return [];
    }
  },
  activeTab: () => {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB) || 'setup';
  },
  currentBuildId: () => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_BUILD_ID) || null;
  }
};

// Expose clear function globally for debugging
if (typeof window !== 'undefined') {
  (window as any).clearDataImportState = clearDataImportState;
  console.log('🔧 Debug: Use window.clearDataImportState() to reset import state');
}