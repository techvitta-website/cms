-- =====================================================
-- CRITICAL: Storage Objects Table Policies
-- =====================================================
-- Run this in Supabase Dashboard → SQL Editor
-- These policies are needed for storage.objects table

-- Drop existing policies on storage.objects if they exist
DROP POLICY IF EXISTS "anon insert resumes objects" ON storage.objects;
DROP POLICY IF EXISTS "anon select resumes objects" ON storage.objects;
DROP POLICY IF EXISTS "auth insert resumes objects" ON storage.objects;
DROP POLICY IF EXISTS "auth select resumes objects" ON storage.objects;

-- Create policies directly on storage.objects table
CREATE POLICY "anon insert resumes objects"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'resumes'::text
);

CREATE POLICY "anon select resumes objects"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'resumes'::text
);

CREATE POLICY "auth insert resumes objects"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resumes'::text
);

CREATE POLICY "auth select resumes objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'::text
);

-- Verify policies were created
SELECT 
  policyname,
  cmd as operation,
  roles
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%resumes%'
ORDER BY policyname;

-- Should show 4 policies for storage.objects table









