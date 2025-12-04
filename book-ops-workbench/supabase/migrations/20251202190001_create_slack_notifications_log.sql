-- Create table to log all Slack notifications sent
CREATE TABLE IF NOT EXISTS slack_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,  -- 'feedback', 'review_assigned', 'proposal_approved', 'proposal_rejected', 'build_status'
  recipient_email text,
  recipient_slack_user text,  -- @username or user ID
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}',  -- Additional context (build_id, account_id, etc.)
  status text NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'failed', 'fallback'
  error_message text,
  slack_response jsonb,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

-- Index for querying by type and status
CREATE INDEX idx_slack_notifications_type ON slack_notifications_log(notification_type);
CREATE INDEX idx_slack_notifications_status ON slack_notifications_log(status);
CREATE INDEX idx_slack_notifications_created ON slack_notifications_log(created_at DESC);

-- RLS policies
ALTER TABLE slack_notifications_log ENABLE ROW LEVEL SECURITY;

-- Only allow inserts from edge functions (service role)
CREATE POLICY "Service role can manage slack_notifications_log"
ON slack_notifications_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated users to view their own notifications
CREATE POLICY "Users can view their own notifications"
ON slack_notifications_log
FOR SELECT
TO authenticated
USING (recipient_email = auth.jwt()->>'email');

-- Allow RevOps to view all notifications
CREATE POLICY "RevOps can view all notifications"
ON slack_notifications_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND UPPER(profiles.role) = 'REVOPS'
  )
);

