-- ============================================
-- FIX Document Type Constraint Error
-- Run this in Supabase SQL Editor
-- ============================================
-- This fixes the "violates check constraint" error for document_type
-- ============================================

-- Step 1: Drop the existing constraint
ALTER TABLE candidate_documents 
DROP CONSTRAINT IF EXISTS candidate_documents_document_type_check;

-- Step 2: Add updated constraint with ALL document types
ALTER TABLE candidate_documents 
ADD CONSTRAINT candidate_documents_document_type_check 
CHECK (document_type IN (
  -- New document types (used by the application)
  'educational_credentials',
  'resume_copy',
  'id_proof',
  'professional_certificates',
  'previous_employment',
  -- Legacy types (for backward compatibility)
  'aadhar',
  'pan',
  'degree',
  'experience',
  'address_proof',
  'bank_details',
  'photo',
  'other'
));

-- Step 3: Verify the constraint was created
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'candidate_documents'::regclass
  AND conname = 'candidate_documents_document_type_check';

-- ============================================
-- After running this, the document upload should work!
-- ============================================

