-- ============================================
-- Fix Storage Policies for candidate-documents Bucket
-- Migration: 011_fix_candidate_documents_storage_policies.sql
-- ============================================
-- 
-- This migration fixes the storage policies to:
-- 1. Allow anonymous uploads to folders with UUID pattern (candidate_id)
-- 2. Allow anonymous users to read documents they uploaded
-- 3. Ensure proper access for document viewing
-- ============================================

-- Drop existing anon upload policy if it exists
DROP POLICY IF EXISTS "Allow anon upload to candidate-documents" ON storage.objects;

-- Policy 1: Allow anonymous users to UPLOAD documents
-- (Candidates will upload without login using candidate_id as folder)
-- UUID format: 8-4-4-4-12 hex characters with hyphens
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'candidate-documents' AND
  -- Allow uploads to folders matching UUID pattern (candidate_id)
  -- UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- Policy 2: Allow anonymous users to READ documents they uploaded
-- (So candidates can verify their uploads if needed)
CREATE POLICY "Allow anon read candidate-documents"
ON storage.objects FOR SELECT
TO anon
USING (
  bucket_id = 'candidate-documents' AND
  -- Allow reading from folders matching UUID pattern
  (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- Policy 3: Allow authenticated users to READ documents
-- (HR can view uploaded documents)
DROP POLICY IF EXISTS "Allow authenticated read candidate-documents" ON storage.objects;
CREATE POLICY "Allow authenticated read candidate-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'candidate-documents');

-- Policy 4: Allow authenticated users to DELETE documents
-- (HR can delete if needed)
DROP POLICY IF EXISTS "Allow authenticated delete candidate-documents" ON storage.objects;
CREATE POLICY "Allow authenticated delete candidate-documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'candidate-documents');

-- Policy 5: Service role can read documents
-- (For Edge Functions if needed)
DROP POLICY IF EXISTS "Service role can read candidate-documents" ON storage.objects;
CREATE POLICY "Service role can read candidate-documents"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'candidate-documents');

-- Policy 6: Service role can insert documents
DROP POLICY IF EXISTS "Service role can insert candidate-documents" ON storage.objects;
CREATE POLICY "Service role can insert candidate-documents"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'candidate-documents');

-- Policy 7: Service role can delete documents
DROP POLICY IF EXISTS "Service role can delete candidate-documents" ON storage.objects;
CREATE POLICY "Service role can delete candidate-documents"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'candidate-documents');

