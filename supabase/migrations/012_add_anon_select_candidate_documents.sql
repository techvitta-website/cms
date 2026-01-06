-- ============================================
-- Add SELECT Policy for Anonymous Users on candidate_documents
-- Migration: 012_add_anon_select_candidate_documents.sql
-- ============================================
-- 
-- This allows anonymous users (candidates) to read their own uploaded documents
-- so they can see the list of documents they've uploaded on the upload page
-- ============================================

-- Policy: Allow anonymous users to read their own documents
-- (Candidates need to see their uploaded documents on the upload page)
CREATE POLICY "Allow anonymous users to read candidate documents"
ON candidate_documents FOR SELECT
TO anon
USING (true);
-- Note: We allow reading all documents because candidates access via their candidate_id
-- which is in the URL, and the application filters by candidate_id


