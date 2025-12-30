-- ============================================
-- COMPLETE STORAGE FIX - Run this in Supabase SQL Editor
-- ============================================
-- This will completely fix the storage upload issue
-- ============================================

-- Step 1: Drop ALL existing policies for candidate-documents (clean slate)
DROP POLICY IF EXISTS "Allow anon upload to candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon read candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read candidate-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete candidate-documents" ON storage.objects;

-- Step 2: Create the SIMPLEST possible policy for anon upload
-- NO folder restrictions, NO pattern matching - just bucket check
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'candidate-documents'
);

-- Step 3: Create simple read policy for anon
CREATE POLICY "Allow anon read candidate-documents"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'candidate-documents'
);

-- Step 4: Recreate authenticated policies (in case they were dropped)
DROP POLICY IF EXISTS "Allow authenticated read candidate-documents" ON storage.objects;
CREATE POLICY "Allow authenticated read candidate-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'candidate-documents');

DROP POLICY IF EXISTS "Allow authenticated delete candidate-documents" ON storage.objects;
CREATE POLICY "Allow authenticated delete candidate-documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'candidate-documents');

-- Step 5: Ensure service role policies exist
DROP POLICY IF EXISTS "Service role can read candidate-documents" ON storage.objects;
CREATE POLICY "Service role can read candidate-documents"
ON storage.objects
FOR SELECT
TO service_role
USING (bucket_id = 'candidate-documents');

DROP POLICY IF EXISTS "Service role can insert candidate-documents" ON storage.objects;
CREATE POLICY "Service role can insert candidate-documents"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'candidate-documents');

DROP POLICY IF EXISTS "Service role can delete candidate-documents" ON storage.objects;
CREATE POLICY "Service role can delete candidate-documents"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'candidate-documents');

-- ============================================
-- IMPORTANT: After running this, wait 10 seconds
-- Then test the upload again
-- ============================================

