-- ============================================
-- Allow Anonymous Users to INSERT into candidates table
-- Migration: 017_allow_anon_insert_candidates.sql
-- ============================================
-- 
-- This allows anonymous users (public form submissions) to create candidate records
-- This is needed for the public candidate application form that can be shared on social media
-- Security: Only allows INSERT, not UPDATE or DELETE
-- ============================================

-- Policy: Allow anonymous users to insert candidate records
-- (Public form submissions need to create new candidate records)
CREATE POLICY "Allow anonymous users to insert candidates"
ON candidates FOR INSERT
TO anon
WITH CHECK (true);

-- Also ensure resume_upload_hashes table allows anonymous inserts
-- (Needed when uploading resumes via public form)
DROP POLICY IF EXISTS "Allow anonymous users to insert resume hashes" ON resume_upload_hashes;
CREATE POLICY "Allow anonymous users to insert resume hashes"
ON resume_upload_hashes FOR INSERT
TO anon
WITH CHECK (true);

-- ============================================
-- PART 2: Storage Policies for Resume Uploads
-- ============================================
-- Allow anonymous users to upload resumes to resume buckets
-- This is needed for the public candidate form

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

