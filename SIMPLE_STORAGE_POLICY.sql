-- ============================================
-- SIMPLE STORAGE POLICY - If UUID pattern doesn't work
-- ============================================
-- This allows anonymous uploads to candidate-documents bucket
-- with any folder structure (less restrictive but works)
-- ============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Allow anon upload to candidate-documents" ON storage.objects;

-- Create simple policy - allows all uploads to candidate-documents bucket
CREATE POLICY "Allow anon upload to candidate-documents"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'candidate-documents');

-- Also fix read policy
DROP POLICY IF EXISTS "Allow anon read candidate-documents" ON storage.objects;
CREATE POLICY "Allow anon read candidate-documents"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'candidate-documents');

-- ============================================
-- This is simpler and should work immediately
-- ============================================

