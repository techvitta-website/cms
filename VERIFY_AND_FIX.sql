-- ============================================
-- VERIFY BUCKET AND FIX POLICIES
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Check if bucket exists (this will show error if bucket doesn't exist)
SELECT * FROM storage.buckets WHERE name = 'candidate-documents';

-- Step 2: Drop ALL existing anon policies
DROP POLICY IF EXISTS "Allow anon upload to candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon read candidate-documents" ON storage.objects;

-- Step 3: Create policy with ABSOLUTELY NO restrictions
-- This is the simplest possible policy - just checks bucket name
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'candidate-documents');

-- Step 4: Create read policy
CREATE POLICY "Allow anon read candidate-documents"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'candidate-documents');

-- Step 5: Verify policies were created
SELECT 
  policyname, 
  cmd, 
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%candidate-documents%'
ORDER BY policyname;

-- ============================================
-- If bucket doesn't exist, create it first:
-- Go to Storage → Buckets → New Bucket
-- Name: candidate-documents
-- Public: OFF
-- ============================================

