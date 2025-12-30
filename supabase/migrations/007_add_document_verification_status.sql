-- Add document_verification_status column to candidates table
-- This tracks the status of document collection and verification

ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS document_verification_status TEXT DEFAULT 'not_requested';

-- Update existing approved candidates to have 'not_requested' status
UPDATE candidates 
SET document_verification_status = 'not_requested'
WHERE document_verification_status IS NULL AND status = 'Approved';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_candidates_document_verification_status 
ON candidates(document_verification_status);

-- Add comment for documentation
COMMENT ON COLUMN candidates.document_verification_status IS 
'Status of document verification: not_requested, requested, submitted, verified, rejected';


