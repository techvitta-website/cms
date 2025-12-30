-- ============================================
-- FIX STORAGE POLICY - Run this NOW in Supabase SQL Editor
-- ============================================
-- This will fix the "Allow anon upload to candidate-documents" policy
-- to correctly match UUID folder pattern
-- ============================================

-- Step 1: Drop the existing policy
DROP POLICY IF EXISTS "Allow anon upload to candidate-documents" ON storage.objects;

-- Step 2: Recreate with correct UUID pattern (case-insensitive)
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'candidate-documents' AND
  -- Match UUID pattern (case-insensitive): xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  -- Using case-insensitive match for UUIDs
  (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- Step 3: Also fix the read policy
DROP POLICY IF EXISTS "Allow anon read candidate-documents" ON storage.objects;
CREATE POLICY "Allow anon read candidate-documents"
ON storage.objects FOR SELECT
TO anon
USING (
  bucket_id = 'candidate-documents' AND
  (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- ============================================
-- IMPORTANT: After running this, test the upload again
-- ============================================

