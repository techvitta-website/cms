-- ============================================
-- Add is_archived column to candidates table
-- Migration: 015_add_is_archived_to_candidates.sql
-- ============================================

-- Add is_archived column to candidates table
ALTER TABLE candidates 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_candidates_is_archived 
ON candidates(is_archived);

-- Update existing records to have is_archived = false (if null)
UPDATE candidates 
SET is_archived = FALSE 
WHERE is_archived IS NULL;

-- Add comment to column
COMMENT ON COLUMN candidates.is_archived IS 'Indicates if the candidate has been archived (soft delete). When true, candidate is hidden from main dashboard but can be restored.';





