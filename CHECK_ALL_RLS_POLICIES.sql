-- ============================================
-- Check ALL RLS Policies for Document Upload
-- Run this to see what policies exist
-- ============================================

-- Check candidate_documents table policies
SELECT 
  'candidate_documents' AS table_name,
  policyname AS "Policy Name",
  cmd AS "Command",
  roles AS "Roles",
  qual AS "Using",
  with_check AS "With Check"
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'candidate_documents'
ORDER BY cmd, policyname;

-- Check candidates table policies
SELECT 
  'candidates' AS table_name,
  policyname AS "Policy Name",
  cmd AS "Command",
  roles AS "Roles",
  qual AS "Using",
  with_check AS "With Check"
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'candidates'
  AND (policyname LIKE '%document%' OR policyname LIKE '%anon%' OR cmd = 'UPDATE')
ORDER BY cmd, policyname;

-- Check storage.objects policies for candidate-documents
SELECT 
  'storage.objects' AS table_name,
  policyname AS "Policy Name",
  cmd AS "Command",
  roles AS "Roles",
  qual AS "Using",
  with_check AS "With Check"
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%candidate-documents%'
ORDER BY cmd, policyname;

