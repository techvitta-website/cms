-- ============================================
-- Ensure Public Form Data Saves to Database
-- Migration: 018_ensure_public_form_save.sql
-- ============================================
-- 
-- This migration ensures that data from the public candidate form
-- can be saved to the candidates table in the CMS dashboard
-- ============================================

-- ============================================
-- PART 1: Ensure RLS Policies Allow Anonymous Inserts
-- ============================================

-- Policy: Allow anonymous users to insert candidate records
-- (Public form submissions need to create new candidate records)
DROP POLICY IF EXISTS "Allow anonymous users to insert candidates" ON candidates;
CREATE POLICY "Allow anonymous users to insert candidates"
ON candidates FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow anonymous users to update candidate records (for duplicate email handling)
-- This allows updating existing candidates when same email is used
DROP POLICY IF EXISTS "Allow anonymous users to update candidates" ON candidates;
CREATE POLICY "Allow anonymous users to update candidates"
ON candidates FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Also ensure resume_upload_hashes table allows anonymous inserts
DROP POLICY IF EXISTS "Allow anonymous users to insert resume hashes" ON resume_upload_hashes;
CREATE POLICY "Allow anonymous users to insert resume hashes"
ON resume_upload_hashes FOR INSERT
TO anon
WITH CHECK (true);

-- ============================================
-- PART 2: Ensure Required Columns Exist
-- ============================================

-- Ensure reference_source column exists (to track form submissions)
ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS reference_source TEXT;

-- Ensure phone column is NOT NULL constraint is not too strict
-- (We'll allow nulls but form validation requires it)
-- Note: If phone needs to be NOT NULL, uncomment below:
-- ALTER TABLE candidates ALTER COLUMN phone SET NOT NULL;

-- ============================================
-- PART 3: Storage Policies for Resume Uploads
-- ============================================

-- Policy for resumes-private bucket (if it exists)
DROP POLICY IF EXISTS "Allow anonymous upload to resumes-private" ON storage.objects;
CREATE POLICY "Allow anonymous upload to resumes-private"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'resumes-private');

-- Policy for resumes bucket (if it exists)
DROP POLICY IF EXISTS "Allow anonymous upload to resumes" ON storage.objects;
CREATE POLICY "Allow anonymous upload to resumes"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'resumes');

-- ============================================
-- PART 4: Verify Table Structure
-- ============================================

-- Check that all required columns exist
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'candidates' 
    AND column_name IN ('full_name', 'email', 'phone', 'resume_url', 'resume_hash', 'reference_source', 'status', 'resume_processed')
ORDER BY column_name;

-- ============================================
-- PART 5: Example Insert Statement (for testing)
-- ============================================
-- Uncomment and modify to test:
/*
INSERT INTO candidates (
    full_name,
    email,
    phone,
    resume_url,
    resume_hash,
    reference_source,
    status,
    resume_processed,
    job_id
) VALUES (
    'Test Candidate',
    'test@example.com',
    '+1234567890',
    'resumes-private/1234567890_0_resume.pdf',
    'abc123def456...',
    'Public Form',
    'Pending',
    false,
    NULL
);
*/

-- ============================================
-- VERIFICATION: Check Policies
-- ============================================
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE tablename IN ('candidates', 'resume_upload_hashes')
    AND roles::text LIKE '%anon%'
ORDER BY tablename, policyname;

