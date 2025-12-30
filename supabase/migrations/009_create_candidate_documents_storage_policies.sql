-- ============================================
-- Storage Policies for candidate-documents Bucket
-- Migration: 009_create_candidate_documents_storage_policies.sql
-- ============================================
-- 
-- IMPORTANT: Create the bucket first in Supabase Dashboard:
-- Storage → Buckets → New Bucket
-- Name: candidate-documents
-- Public: OFF (Private)
-- File size limit: 10 MB
-- Allowed MIME types: application/pdf,image/jpeg,image/jpg,image/png
-- ============================================

-- Policy 1: Allow anonymous users to UPLOAD documents
-- (Candidates will upload without login using token)
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'candidate-documents' AND
  -- Only allow uploads to folders matching token pattern (UUID format)
  (storage.foldername(name))[1] ~ '^[a-zA-Z0-9_-]{20,}$'
);

-- Policy 2: Allow authenticated users to READ documents
-- (HR can view uploaded documents)
CREATE POLICY "Allow authenticated read candidate-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'candidate-documents');

-- Policy 3: Allow authenticated users to DELETE documents
-- (HR can delete if needed)
CREATE POLICY "Allow authenticated delete candidate-documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'candidate-documents');

-- Policy 4: Service role can read documents
-- (For Edge Functions if needed)
CREATE POLICY "Service role can read candidate-documents"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'candidate-documents');

-- Policy 5: Service role can insert documents
CREATE POLICY "Service role can insert candidate-documents"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'candidate-documents');

-- Policy 6: Service role can delete documents
CREATE POLICY "Service role can delete candidate-documents"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'candidate-documents');


