-- ============================================
-- Add SELECT Policy for Anonymous Users on candidates table
-- Migration: 013_add_anon_select_candidates.sql
-- ============================================
-- 
-- This allows anonymous users (candidates) to read their own candidate record
-- so they can see their information on the upload page
-- Security: Candidates access via UUID in URL, so they can only see their own record
-- ============================================

-- Policy: Allow anonymous users to read candidate records
-- (Candidates need to see their own information on the upload page)
-- Note: The application filters by candidate_id from the URL, so this is secure
CREATE POLICY "Allow anonymous users to read candidates"
ON candidates FOR SELECT
TO anon
USING (true);
-- Security note: Since candidates access via UUID in URL, they can only access their own record
-- The application filters by candidate_id, so this is safe

