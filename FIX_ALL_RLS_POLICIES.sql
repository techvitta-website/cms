-- ============================================
-- COMPLETE RLS FIX for Document Upload
-- This fixes ALL RLS policies needed for document upload
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PART 1: candidate_documents TABLE POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow anonymous users to insert candidate documents" ON candidate_documents;
DROP POLICY IF EXISTS "Allow anonymous users to read candidate documents" ON candidate_documents;
DROP POLICY IF EXISTS "Allow authenticated users to insert candidate documents" ON candidate_documents;
DROP POLICY IF EXISTS "Allow authenticated users to read candidate documents" ON candidate_documents;
DROP POLICY IF EXISTS "Allow authenticated users to update candidate documents" ON candidate_documents;

-- Policy 1: Allow anonymous users to INSERT into candidate_documents
-- This is CRITICAL for document upload to work
CREATE POLICY "Allow anonymous users to insert candidate documents"
ON candidate_documents FOR INSERT
TO anon
WITH CHECK (true);

-- Policy 2: Allow anonymous users to SELECT from candidate_documents
-- Needed to check existing documents before upload
CREATE POLICY "Allow anonymous users to read candidate documents"
ON candidate_documents FOR SELECT
TO anon
USING (true);

-- Policy 3: Allow authenticated users to INSERT (for HR)
CREATE POLICY "Allow authenticated users to insert candidate documents"
ON candidate_documents FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy 4: Allow authenticated users to SELECT (for HR)
CREATE POLICY "Allow authenticated users to read candidate documents"
ON candidate_documents FOR SELECT
TO authenticated
USING (true);

-- Policy 5: Allow authenticated users to UPDATE (for HR)
CREATE POLICY "Allow authenticated users to update candidate documents"
ON candidate_documents FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- PART 2: candidates TABLE POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow anonymous users to read candidates" ON candidates;
DROP POLICY IF EXISTS "Allow anonymous users to update document verification status" ON candidates;

-- Policy 1: Allow anonymous users to SELECT from candidates
-- Needed to load candidate data on upload page
CREATE POLICY "Allow anonymous users to read candidates"
ON candidates FOR SELECT
TO anon
USING (true);

-- Policy 2: Allow anonymous users to UPDATE document_verification_status
-- Needed when first document is uploaded
CREATE POLICY "Allow anonymous users to update document verification status"
ON candidates FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- ============================================
-- PART 3: STORAGE POLICIES (Already correct, but ensuring)
-- ============================================

-- Drop and recreate to ensure they're correct
DROP POLICY IF EXISTS "Allow anon upload to candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon read candidate-documents" ON storage.objects;

-- Storage Policy 1: Allow anonymous upload (NO folder restrictions)
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'candidate-documents');

-- Storage Policy 2: Allow anonymous read
CREATE POLICY "Allow anon read candidate-documents"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'candidate-documents');

-- ============================================
-- VERIFICATION: Check all policies were created
-- ============================================
SELECT 'candidate_documents policies:' AS info;
SELECT policyname, cmd, roles FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'candidate_documents' AND roles::text LIKE '%anon%'
ORDER BY cmd;

SELECT 'candidates policies:' AS info;
SELECT policyname, cmd, roles FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'candidates' AND roles::text LIKE '%anon%'
ORDER BY cmd;

SELECT 'storage policies:' AS info;
SELECT policyname, cmd, roles FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%candidate-documents%' AND roles::text LIKE '%anon%'
ORDER BY cmd;

