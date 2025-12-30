-- Update document_type constraint to support new document types
-- This migration updates the candidate_documents table to allow the new document types

-- First, drop the existing constraint
ALTER TABLE candidate_documents 
DROP CONSTRAINT IF EXISTS candidate_documents_document_type_check;

-- Add new constraint with updated document types
ALTER TABLE candidate_documents 
ADD CONSTRAINT candidate_documents_document_type_check 
CHECK (document_type IN (
  'educational_credentials',
  'resume_copy',
  'id_proof',
  'professional_certificates',
  'previous_employment',
  -- Keep old types for backward compatibility
  'aadhar',
  'pan',
  'degree',
  'experience',
  'address_proof',
  'bank_details',
  'photo',
  'other'
));

-- Add comment for documentation
COMMENT ON COLUMN candidate_documents.document_type IS 
'Document type: educational_credentials, resume_copy, id_proof, professional_certificates, previous_employment (or legacy types)';


