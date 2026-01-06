-- ============================================
-- QUICK FIX: Fix Document Upload to Storage Bucket
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- Step 1: Drop old storage policy if exists
DROP POLICY IF EXISTS "Allow anon upload to candidate-documents" ON storage.objects;

-- Step 2: Create new policy that allows UUID folder pattern (candidate_id)
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'candidate-documents' AND
  -- Allow uploads to folders matching UUID pattern (candidate_id)
  -- UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- Step 3: Allow anonymous users to read their uploaded documents
DROP POLICY IF EXISTS "Allow anon read candidate-documents" ON storage.objects;
CREATE POLICY "Allow anon read candidate-documents"
ON storage.objects FOR SELECT
TO anon
USING (
  bucket_id = 'candidate-documents' AND
  (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- Step 4: Allow anonymous users to read from candidate_documents table
DROP POLICY IF EXISTS "Allow anonymous users to read candidate documents" ON candidate_documents;
CREATE POLICY "Allow anonymous users to read candidate documents"
ON candidate_documents FOR SELECT
TO anon
USING (true);

-- Step 5: Allow anonymous users to read from candidates table
DROP POLICY IF EXISTS "Allow anonymous users to read candidates" ON candidates;
CREATE POLICY "Allow anonymous users to read candidates"
ON candidates FOR SELECT
TO anon
USING (true);

-- Step 6: Allow anonymous users to update document_verification_status
DROP POLICY IF EXISTS "Allow anonymous users to update document verification status" ON candidates;
CREATE POLICY "Allow anonymous users to update document verification status"
ON candidates FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- ============================================
-- Verification: Check if policies were created
-- ============================================
-- After running, go to:
-- Storage → Policies → Check for "Allow anon upload to candidate-documents"
-- Table Editor → candidate_documents → Check RLS policies
-- Table Editor → candidates → Check RLS policies


