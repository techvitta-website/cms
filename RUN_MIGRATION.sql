-- ============================================
-- RUN THIS IN SUPABASE SQL EDITOR
-- Copy and paste this entire file into Supabase SQL Editor and click RUN
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

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'candidates' AND column_name = 'is_archived';





