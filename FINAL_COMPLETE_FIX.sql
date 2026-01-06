-- ============================================
-- FINAL COMPLETE FIX - Storage Upload RLS Error
-- This will fix the 403 Unauthorized error
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- STEP 1: Drop ALL existing storage policies for candidate-documents
-- ============================================
DROP POLICY IF EXISTS "Allow anon upload to candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon read candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role can read candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role can insert candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete candidate-documents" ON storage.objects;

-- ============================================
-- STEP 2: Create SIMPLE storage policies (NO restrictions)
-- ============================================

-- Policy 1: Allow anonymous INSERT - SIMPLEST POSSIBLE
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'candidate-documents');

-- Policy 2: Allow anonymous SELECT
CREATE POLICY "Allow anon read candidate-documents"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'candidate-documents');

-- Policy 3: Allow authenticated SELECT
CREATE POLICY "Allow authenticated read candidate-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'candidate-documents');

-- Policy 4: Allow authenticated DELETE
CREATE POLICY "Allow authenticated delete candidate-documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'candidate-documents');

-- Policy 5: Service role SELECT
CREATE POLICY "Service role can read candidate-documents"
ON storage.objects
FOR SELECT
TO service_role
USING (bucket_id = 'candidate-documents');

-- Policy 6: Service role INSERT
CREATE POLICY "Service role can insert candidate-documents"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'candidate-documents');

-- Policy 7: Service role DELETE
CREATE POLICY "Service role can delete candidate-documents"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'candidate-documents');

-- ============================================
-- STEP 3: Ensure candidate_documents table policies exist
-- ============================================
DROP POLICY IF EXISTS "Allow anonymous users to insert candidate documents" ON candidate_documents;
DROP POLICY IF EXISTS "Allow anonymous users to read candidate documents" ON candidate_documents;

CREATE POLICY "Allow anonymous users to insert candidate documents"
ON candidate_documents FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Allow anonymous users to read candidate documents"
ON candidate_documents FOR SELECT
TO anon
USING (true);

-- ============================================
-- STEP 4: Ensure candidates table policies exist
-- ============================================
DROP POLICY IF EXISTS "Allow anonymous users to read candidates" ON candidates;
DROP POLICY IF EXISTS "Allow anonymous users to update document verification status" ON candidates;

CREATE POLICY "Allow anonymous users to read candidates"
ON candidates FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow anonymous users to update document verification status"
ON candidates FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- ============================================
-- STEP 5: Verify bucket exists and check settings
-- ============================================
SELECT 
  name,
  id,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets 
WHERE name = 'candidate-documents';

-- ============================================
-- STEP 6: Verify all policies were created
-- ============================================
SELECT 
  'Storage Policies' AS policy_type,
  policyname,
  cmd,
  roles::text AS roles
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%candidate-documents%'
ORDER BY cmd, policyname;

SELECT 
  'Table Policies - candidate_documents' AS policy_type,
  policyname,
  cmd,
  roles::text AS roles
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'candidate_documents'
  AND roles::text LIKE '%anon%'
ORDER BY cmd, policyname;

SELECT 
  'Table Policies - candidates' AS policy_type,
  policyname,
  cmd,
  roles::text AS roles
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'candidates'
  AND roles::text LIKE '%anon%'
ORDER BY cmd, policyname;


