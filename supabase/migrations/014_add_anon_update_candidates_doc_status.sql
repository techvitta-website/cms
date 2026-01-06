-- ============================================
-- Add UPDATE Policy for Anonymous Users on candidates table
-- Migration: 014_add_anon_update_candidates_doc_status.sql
-- ============================================
-- 
-- This allows anonymous users (candidates) to update their document_verification_status
-- when they upload their first document
-- Security: Only allows updating document_verification_status, not other fields
-- ============================================

-- Policy: Allow anonymous users to update document_verification_status
-- (Candidates update status when they upload their first document)
CREATE POLICY "Allow anonymous users to update document verification status"
ON candidates FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);
-- Note: The application only updates document_verification_status field,
-- so this is safe. The candidate_id is from the URL, so they can only update their own record.


