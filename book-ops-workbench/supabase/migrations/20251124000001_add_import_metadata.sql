-- Migration: Add import_metadata table to persist import state across page refreshes
-- This stores field mappings, validation status, and import timestamps for each data type per build

CREATE TABLE IF NOT EXISTS public.import_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    build_id UUID REFERENCES public.builds(id) ON DELETE CASCADE,
    data_type TEXT NOT NULL CHECK (data_type IN ('accounts', 'opportunities', 'sales_reps')),
    
    -- Import status and timestamps
    import_status TEXT NOT NULL DEFAULT 'pending' CHECK (import_status IN ('pending', 'mapped', 'validated', 'completed', 'error')),
    imported_at TIMESTAMPTZ,
    imported_by UUID,
    
    -- Record counts
    total_rows INTEGER,
    valid_rows INTEGER,
    error_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    
    -- Field mappings (JSON object: { csvField: schemaField })
    field_mappings JSONB DEFAULT '{}',
    
    -- Auto-mapping summary (JSON object with stats)
    auto_mapping_summary JSONB,
    
    -- Validation results summary (JSON object)
    validation_summary JSONB,
    
    -- Original file info
    original_filename TEXT,
    original_file_size INTEGER,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one metadata record per data type per build
    UNIQUE (build_id, data_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_import_metadata_build_id ON public.import_metadata(build_id);

-- Add RLS policies
ALTER TABLE public.import_metadata ENABLE ROW LEVEL SECURITY;

-- Allow users to read import metadata for builds they can access
CREATE POLICY "Users can read import metadata" ON public.import_metadata
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.builds b
            WHERE b.id = import_metadata.build_id
        )
    );

-- Allow authenticated users to insert import metadata (REVOPS, FLM, SLM)
CREATE POLICY "Authenticated users can insert import metadata" ON public.import_metadata
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
    );

-- Allow authenticated users to update import metadata
CREATE POLICY "Authenticated users can update import metadata" ON public.import_metadata
    FOR UPDATE USING (
        auth.uid() IS NOT NULL
    );

-- Allow authenticated users to delete import metadata  
CREATE POLICY "Authenticated users can delete import metadata" ON public.import_metadata
    FOR DELETE USING (
        auth.uid() IS NOT NULL
    );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_import_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_import_metadata_updated_at
    BEFORE UPDATE ON public.import_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_import_metadata_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.import_metadata IS 'Stores import configuration and status for each data type (accounts, opportunities, sales_reps) per build. Persists field mappings and validation state across page refreshes.';

