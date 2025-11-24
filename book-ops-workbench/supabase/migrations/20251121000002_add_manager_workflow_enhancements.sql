-- Phase 1: Manager Workflow Enhancements
-- Add categories, status, tags to manager_notes
-- Add manager_review_analytics table for team review tracking

-- 1. Enhance manager_notes table
ALTER TABLE manager_notes
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('concern', 'question', 'approval', 'general')) DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('open', 'resolved', 'escalated')) DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reassignment_id UUID REFERENCES manager_reassignments(id) ON DELETE SET NULL;

-- Add index for better query performance on filtered notes
CREATE INDEX IF NOT EXISTS idx_manager_notes_status
  ON manager_notes(build_id, manager_user_id, status);

CREATE INDEX IF NOT EXISTS idx_manager_notes_category
  ON manager_notes(build_id, category);

CREATE INDEX IF NOT EXISTS idx_manager_notes_reassignment
  ON manager_notes(reassignment_id)
  WHERE reassignment_id IS NOT NULL;

-- 2. Create manager_review_analytics table for team review tracking
CREATE TABLE IF NOT EXISTS manager_review_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID REFERENCES builds(id) ON DELETE CASCADE NOT NULL,
  manager_user_id UUID REFERENCES auth.users(id) NOT NULL,
  manager_level TEXT CHECK (manager_level IN ('FLM', 'SLM')),

  -- Reassignment metrics
  total_reassignments INTEGER DEFAULT 0,
  pending_count INTEGER DEFAULT 0,
  approved_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,

  -- Note metrics
  total_notes INTEGER DEFAULT 0,
  open_notes INTEGER DEFAULT 0,
  concern_notes INTEGER DEFAULT 0,

  -- Performance metrics
  avg_turnaround_hours DECIMAL,
  first_reviewed_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(build_id, manager_user_id)
);

-- Enable RLS
ALTER TABLE manager_review_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for manager_review_analytics
CREATE POLICY "Managers can view their own analytics"
ON manager_review_analytics
FOR SELECT
USING (manager_user_id = auth.uid());

CREATE POLICY "RevOps can view all analytics"
ON manager_review_analytics
FOR SELECT
USING (get_current_user_role() = ANY(ARRAY['REVOPS', 'LEADERSHIP']));

CREATE POLICY "System can manage analytics"
ON manager_review_analytics
FOR ALL
USING (get_current_user_role() = ANY(ARRAY['REVOPS', 'LEADERSHIP']));

-- 3. Create function to update analytics automatically
CREATE OR REPLACE FUNCTION update_manager_review_analytics()
RETURNS TRIGGER AS $$
DECLARE
  manager_id UUID;
  build_id_val UUID;
BEGIN
  -- Determine which record to use (NEW for INSERT/UPDATE, OLD for DELETE)
  IF TG_OP = 'DELETE' THEN
    manager_id := OLD.manager_user_id;
    build_id_val := OLD.build_id;
  ELSE
    manager_id := NEW.manager_user_id;
    build_id_val := NEW.build_id;
  END IF;

  -- Update or insert analytics record
  INSERT INTO manager_review_analytics (
    build_id,
    manager_user_id,
    total_reassignments,
    pending_count,
    approved_count,
    rejected_count,
    total_notes,
    open_notes,
    concern_notes,
    last_activity_at
  )
  SELECT
    build_id_val,
    manager_id,
    COUNT(DISTINCT mr.id) FILTER (WHERE mr.id IS NOT NULL),
    COUNT(mr.id) FILTER (WHERE mr.status = 'pending'),
    COUNT(mr.id) FILTER (WHERE mr.status = 'approved'),
    COUNT(mr.id) FILTER (WHERE mr.status = 'rejected'),
    COUNT(DISTINCT mn.id) FILTER (WHERE mn.id IS NOT NULL),
    COUNT(mn.id) FILTER (WHERE mn.status = 'open'),
    COUNT(mn.id) FILTER (WHERE mn.category = 'concern'),
    NOW()
  FROM (SELECT manager_id as mid, build_id_val as bid) base
  LEFT JOIN manager_reassignments mr ON mr.manager_user_id = base.mid AND mr.build_id = base.bid
  LEFT JOIN manager_notes mn ON mn.manager_user_id = base.mid AND mn.build_id = base.bid
  GROUP BY base.mid, base.bid
  ON CONFLICT (build_id, manager_user_id)
  DO UPDATE SET
    total_reassignments = EXCLUDED.total_reassignments,
    pending_count = EXCLUDED.pending_count,
    approved_count = EXCLUDED.approved_count,
    rejected_count = EXCLUDED.rejected_count,
    total_notes = EXCLUDED.total_notes,
    open_notes = EXCLUDED.open_notes,
    concern_notes = EXCLUDED.concern_notes,
    last_activity_at = EXCLUDED.last_activity_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create triggers to auto-update analytics
DROP TRIGGER IF EXISTS trigger_update_analytics_on_reassignment ON manager_reassignments;
CREATE TRIGGER trigger_update_analytics_on_reassignment
AFTER INSERT OR UPDATE OR DELETE ON manager_reassignments
FOR EACH ROW
EXECUTE FUNCTION update_manager_review_analytics();

DROP TRIGGER IF EXISTS trigger_update_analytics_on_note ON manager_notes;
CREATE TRIGGER trigger_update_analytics_on_note
AFTER INSERT OR UPDATE OR DELETE ON manager_notes
FOR EACH ROW
EXECUTE FUNCTION update_manager_review_analytics();

-- 5. Add trigger for updated_at on manager_review_analytics
CREATE TRIGGER update_manager_review_analytics_updated_at
BEFORE UPDATE ON manager_review_analytics
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
