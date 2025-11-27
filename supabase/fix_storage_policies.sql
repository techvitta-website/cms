-- Fix Storage Policies for resumes-private Bucket
-- Run this SQL in Supabase SQL Editor

-- ============================================
-- STEP 1: Remove Anonymous Access (Make Private)
-- ============================================

-- Remove anonymous policies to make bucket truly private
DROP POLICY IF EXISTS "anon insert resumes-private objects" ON storage.objects;
DROP POLICY IF EXISTS "anon select resumes-private objects" ON storage.objects;

-- ============================================
-- STEP 2: Ensure Authenticated User Policies
-- ============================================

-- Authenticated users can read resumes
CREATE POLICY IF NOT EXISTS "Authenticated users can read resumes"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resumes-private');

-- Authenticated users can upload resumes
CREATE POLICY IF NOT EXISTS "Authenticated users can upload resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes-private');

-- Authenticated users can update resumes
CREATE POLICY IF NOT EXISTS "Authenticated users can update resumes"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'resumes-private')
WITH CHECK (bucket_id = 'resumes-private');

-- Authenticated users can delete resumes
CREATE POLICY IF NOT EXISTS "Authenticated users can delete resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'resumes-private');

-- ============================================
-- STEP 3: Service Role Policies (CRITICAL for Edge Functions)
-- ============================================

-- Service role can read resumes (for Edge Functions)
CREATE POLICY IF NOT EXISTS "Service role can read resumes"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'resumes-private');

-- Service role can upload resumes
CREATE POLICY IF NOT EXISTS "Service role can upload resumes"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'resumes-private');

-- Service role can update resumes
CREATE POLICY IF NOT EXISTS "Service role can update resumes"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'resumes-private')
WITH CHECK (bucket_id = 'resumes-private');

-- Service role can delete resumes
CREATE POLICY IF NOT EXISTS "Service role can delete resumes"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'resumes-private');

-- ============================================
-- Verification Query
-- ============================================

-- Check current policies (run this to verify)
SELECT 
  policyname,
  cmd as command,
  roles as applied_to,
  qual as using_clause
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%resumes%'
ORDER BY policyname;






