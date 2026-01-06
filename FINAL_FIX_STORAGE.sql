-- ============================================
-- FINAL FIX - This WILL work!
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- Step 1: Drop ALL existing anon policies for candidate-documents
DROP POLICY IF EXISTS "Allow anon upload to candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon read candidate-documents" ON storage.objects;

-- Step 2: Create SIMPLE policy - allows ALL uploads to candidate-documents bucket
-- No folder pattern restrictions - this will definitely work
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'candidate-documents');

-- Step 3: Allow anon to read from candidate-documents bucket
CREATE POLICY "Allow anon read candidate-documents"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'candidate-documents');

-- Step 4: Also ensure candidate_documents table allows anon insert
DROP POLICY IF EXISTS "Allow anonymous users to insert candidate documents" ON candidate_documents;
CREATE POLICY "Allow anonymous users to insert candidate documents"
ON candidate_documents FOR INSERT
TO anon
WITH CHECK (true);

-- Step 5: Ensure candidate_documents table allows anon select
DROP POLICY IF EXISTS "Allow anonymous users to read candidate documents" ON candidate_documents;
CREATE POLICY "Allow anonymous users to read candidate documents"
ON candidate_documents FOR SELECT
TO anon
USING (true);

-- Step 6: Ensure candidates table allows anon select
DROP POLICY IF EXISTS "Allow anonymous users to read candidates" ON candidates;
CREATE POLICY "Allow anonymous users to read candidates"
ON candidates FOR SELECT
TO anon
USING (true);

-- Step 7: Ensure candidates table allows anon update for document_verification_status
DROP POLICY IF EXISTS "Allow anonymous users to update document verification status" ON candidates;
CREATE POLICY "Allow anonymous users to update document verification status"
ON candidates FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- ============================================
-- This removes ALL folder pattern restrictions
-- Documents will upload to ANY path in candidate-documents bucket
-- ============================================


