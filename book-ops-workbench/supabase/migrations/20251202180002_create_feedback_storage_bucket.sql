-- Create storage bucket for feedback attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-attachments',
  'feedback-attachments',
  true,  -- Public bucket so Slack can access the URLs
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload to feedback-attachments bucket (authenticated users)
CREATE POLICY "Allow authenticated uploads to feedback-attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'feedback-attachments');

-- Allow public read access (so Slack can show previews)
CREATE POLICY "Allow public read access to feedback-attachments"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'feedback-attachments');





